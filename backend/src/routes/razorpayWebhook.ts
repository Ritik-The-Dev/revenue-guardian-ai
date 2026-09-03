import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { config } from "../config.js";
import { sha256, verifyRazorpaySignature } from "../utils/idempotency.js";
import { webhookEnvelopeSchema } from "../schemas/webhookSchemas.js";
import { markPaymentRecovered } from "../services/recoveryVerificationService.js";
import { runRecoveryPipeline } from "../services/recoveryPipeline.js";
import { audit } from "../services/auditService.js";
import { logEvent } from "../utils/logger.js";
import type { Prisma } from "@prisma/client";

export async function razorpayWebhookRoute(app: FastifyInstance) {
  app.post("/api/webhooks/razorpay", async (request, reply) => {
    // ── 1. Raw body ───────────────────────────────────────────────────────────
    const rawBodyStr: string = request.rawBodyBuffer
      ? request.rawBodyBuffer.toString("utf8")
      : JSON.stringify(request.body ?? {});

    // ── 2. Signature verification ─────────────────────────────────────────────
    const signature = request.headers["x-razorpay-signature"] as string | undefined;
    if (!verifyRazorpaySignature(rawBodyStr, signature, config.razorpayWebhookSecret)) {
      logEvent("WEBHOOK_SIGNATURE_INVALID", { signature });
      return reply.code(401).send({ error: "Invalid signature" });
    }

    // ── 3. Parse + validate envelope ──────────────────────────────────────────
    const parsed = webhookEnvelopeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid Razorpay payload" });
    }
    const event = parsed.data;

    // ── 4. Idempotency ────────────────────────────────────────────────────────
    const eventId = event.id ?? sha256(rawBodyStr);
    const existing = await prisma.webhookEvent.findUnique({
      where: { razorpayEventId: eventId },
    });
    if (existing) {
      logEvent("WEBHOOK_DUPLICATE", { eventId, eventType: event.event });
      return reply.code(200).send({ ok: true, duplicate: true });
    }

    // ── 5. Persist raw event — concurrent-safe ────────────────────────────────
    try {
      await prisma.webhookEvent.create({
        data: {
          razorpayEventId: eventId,
          eventType: event.event,
          payloadHash: sha256(rawBodyStr),
          rawPayload: event.payload as Prisma.InputJsonValue,
          status: "RECEIVED",
        },
      });
    } catch (createErr) {
      const errMsg = String(createErr);
      if (errMsg.includes("Unique constraint") || errMsg.includes("unique") || errMsg.includes("P2002")) {
        logEvent("WEBHOOK_DUPLICATE", { eventId, eventType: event.event, reason: "concurrent_race" });
        return reply.code(200).send({ ok: true, duplicate: true });
      }
      throw createErr;
    }

    logEvent("WEBHOOK_RECEIVED", { eventId, eventType: event.event });

    // ── 6. Route to handler ───────────────────────────────────────────────────
    try {
      switch (event.event) {
        case "payment.failed":
          await handlePaymentFailed(event.payload);
          break;
        case "payment.captured":
          await handlePaymentCaptured(event.payload);
          break;
        case "order.paid":
          await handleOrderPaid(event.payload);
          break;
        case "payment_link.paid":
          await handlePaymentLinkPaid(event.payload);
          break;
        case "payment_link.partially_paid":
          await handlePaymentLinkPartiallyPaid(event.payload);
          break;
        case "payment_link.expired":
          await handlePaymentLinkExpired(event.payload);
          break;
        case "payment_link.cancelled":
          await handlePaymentLinkCancelled(event.payload);
          break;
        case "invoice.paid":
          await handleInvoicePaid(event.payload);
          break;
        case "invoice.partially_paid":
          await handleInvoicePartiallyPaid(event.payload);
          break;
        case "invoice.expired":
          await handleInvoiceExpired(event.payload);
          break;
      }

      await prisma.webhookEvent.update({
        where: { razorpayEventId: eventId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
    } catch (err) {
      logEvent("WEBHOOK_PROCESSING_ERROR", { eventId, error: String(err) });
      await prisma.webhookEvent.update({
        where: { razorpayEventId: eventId },
        data: { status: "FAILED" },
      });
      return reply.send({ ok: false, error: "Processing error — event stored" });
    }

    return reply.send({ ok: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// payment.failed — run full recovery pipeline
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentFailed(payload: Record<string, unknown>) {
  const entity =
    (payload.payment as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};

  const razorpayPaymentId = String(entity.id ?? "");
  if (!razorpayPaymentId) {
    logEvent("WEBHOOK_PAYMENT_FAILED_MISSING_ID", {});
    return;
  }

  await runRecoveryPipeline({
    razorpayPaymentId,
    razorpayOrderId: String(entity.order_id ?? `order_${razorpayPaymentId}`),
    amount: Number(entity.amount ?? 0) / 100,
    currency: String(entity.currency ?? "INR"),
    method: entity.method ? String(entity.method) : null,
    errorCode: entity.error_code ? String(entity.error_code) : null,
    errorDescription: entity.error_description ? String(entity.error_description) : null,
    errorReason: entity.error_reason
      ? String(entity.error_reason)
      : entity.error_source
        ? String(entity.error_source)
        : null,
    customer: {
      externalCustomerId: entity.customer_id ? String(entity.customer_id) : null,
      email: entity.email ? String(entity.email) : null,
      phone: entity.contact ? String(entity.contact) : null,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// payment.captured — mark recovery case RECOVERED
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentCaptured(payload: Record<string, unknown>) {
  const entity = (
    payload.payment as { entity?: { id?: string; amount?: number } } | undefined
  )?.entity;
  if (entity?.id) {
    await markPaymentRecovered(entity.id, entity.amount ? entity.amount / 100 : undefined);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// order.paid — mark order + associated recovery cases RECOVERED
// ─────────────────────────────────────────────────────────────────────────────
async function handleOrderPaid(payload: Record<string, unknown>) {
  const entity =
    (payload.order as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};
  const razorpayOrderId = String(entity.id ?? "");
  if (!razorpayOrderId) return;

  const order = await prisma.order.findUnique({ where: { razorpayOrderId } });
  if (!order) return;

  await prisma.order.update({ where: { razorpayOrderId }, data: { status: "paid" } });

  const cases = await prisma.recoveryCase.findMany({
    where: { orderId: order.id, status: { notIn: ["RECOVERED", "STOPPED"] } },
  });
  for (const item of cases) {
    await prisma.recoveryCase.update({
      where: { id: item.id },
      data: { status: "RECOVERED", recoveredAmount: Number(order.amount) },
    });
    await prisma.recoveryAction.updateMany({
      where: { caseId: item.id, status: { in: ["PENDING", "EXECUTING"] } },
      data: { status: "CANCELLED", error: "Cancelled after order.paid" },
    });
    await audit(item.id, "RECOVERY_COMPLETED", "Order marked paid via order.paid webhook", {
      razorpayOrderId,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// payment_link.paid — find recovery case by payment link ID, mark RECOVERED
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentLinkPaid(payload: Record<string, unknown>) {
  const entity =
    (payload.payment_link as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};

  const razorpayLinkId = String(entity.id ?? "");
  const amountPaid = Number(entity.amount_paid ?? entity.amount ?? 0) / 100;

  if (!razorpayLinkId) return;

  // Find the recovery case that has this payment link
  const recoveryCase = await prisma.recoveryCase.findFirst({
    where: { razorpayPaymentLinkId: razorpayLinkId },
  });
  if (!recoveryCase) {
    logEvent("PAYMENT_LINK_PAID_NO_CASE", { razorpayLinkId });
    return;
  }

  // Idempotent: already recovered
  if (recoveryCase.status === "RECOVERED") return;

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: { status: "RECOVERED", recoveredAmount: amountPaid },
  });
  await prisma.recoveryAction.updateMany({
    where: { caseId: recoveryCase.id, status: { in: ["PENDING", "EXECUTING"] } },
    data: { status: "CANCELLED", error: "Cancelled after payment_link.paid" },
  });
  await audit(recoveryCase.id, "RECOVERY_COMPLETED", "Payment link paid — recovery complete", {
    razorpayLinkId,
    amountPaid,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// payment_link.partially_paid — record partial payment, keep case open
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentLinkPartiallyPaid(payload: Record<string, unknown>) {
  const entity =
    (payload.payment_link as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};

  const razorpayLinkId = String(entity.id ?? "");
  const totalAmount = Number(entity.amount ?? 0) / 100;
  const amountPaid = Number(entity.amount_paid ?? 0) / 100;
  const amountDue = Math.max(0, totalAmount - amountPaid);

  if (!razorpayLinkId) return;

  const recoveryCase = await prisma.recoveryCase.findFirst({
    where: { razorpayPaymentLinkId: razorpayLinkId },
  });
  if (!recoveryCase) {
    logEvent("PAYMENT_LINK_PARTIAL_NO_CASE", { razorpayLinkId });
    return;
  }

  if (recoveryCase.status === "RECOVERED") return;

  // Persist partial payment — case stays open while amount remains due
  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      recoveredAmount: amountPaid,
      amountDue,
      // Do NOT mark RECOVERED — amount_due still outstanding
    },
  });
  await audit(recoveryCase.id, "PARTIAL_RECOVERY", "Partial payment received via payment link", {
    razorpayLinkId,
    amountPaid,
    amountDue,
    totalAmount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// payment_link.expired — mark link expired, cancel link-specific actions,
// keep case open so policy can choose a new action (new link, escalation, etc.)
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentLinkExpired(payload: Record<string, unknown>) {
  const entity =
    (payload.payment_link as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};

  const razorpayLinkId = String(entity.id ?? "");
  if (!razorpayLinkId) return;

  const recoveryCase = await prisma.recoveryCase.findFirst({
    where: { razorpayPaymentLinkId: razorpayLinkId },
  });
  if (!recoveryCase) {
    logEvent("PAYMENT_LINK_EXPIRED_NO_CASE", { razorpayLinkId });
    return;
  }

  if (recoveryCase.status === "RECOVERED" || recoveryCase.status === "STOPPED") return;

  // Cancel actions associated with this link — do not stop the case
  // Policy can create a new link or escalate on next evaluation
  await prisma.recoveryAction.updateMany({
    where: {
      caseId: recoveryCase.id,
      action: "SEND_PAYMENT_LINK",
      status: { in: ["PENDING", "EXECUTING", "SENT"] },
    },
    data: { status: "FAILED", error: "Payment link expired" },
  });

  // Clear the expired link from the case so a new one can be created
  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      paymentLinkUrl: null,
      razorpayPaymentLinkId: null,
      // Move back to waiting — outreach count stays so limits are respected
      status: "WAITING_FOR_OUTCOME",
    },
  });

  await audit(recoveryCase.id, "RECOVERY_LINK_EXPIRED", "Razorpay payment link expired", {
    razorpayLinkId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// payment_link.cancelled — mark link cancelled, cancel related actions
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentLinkCancelled(payload: Record<string, unknown>) {
  const entity =
    (payload.payment_link as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};

  const razorpayLinkId = String(entity.id ?? "");
  if (!razorpayLinkId) return;

  const recoveryCase = await prisma.recoveryCase.findFirst({
    where: { razorpayPaymentLinkId: razorpayLinkId },
  });
  if (!recoveryCase) {
    logEvent("PAYMENT_LINK_CANCELLED_NO_CASE", { razorpayLinkId });
    return;
  }

  if (recoveryCase.status === "RECOVERED" || recoveryCase.status === "STOPPED") return;

  await prisma.recoveryAction.updateMany({
    where: {
      caseId: recoveryCase.id,
      action: "SEND_PAYMENT_LINK",
      status: { in: ["PENDING", "EXECUTING", "SENT"] },
    },
    data: { status: "CANCELLED", error: "Payment link cancelled" },
  });

  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      paymentLinkUrl: null,
      razorpayPaymentLinkId: null,
      status: "STOPPED",
      stopReason: "Payment link cancelled by merchant or customer",
    },
  });

  await audit(recoveryCase.id, "RECOVERY_LINK_CANCELLED", "Razorpay payment link cancelled", {
    razorpayLinkId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// invoice.paid — mark invoice fully paid, recover associated case
// ─────────────────────────────────────────────────────────────────────────────
async function handleInvoicePaid(payload: Record<string, unknown>) {
  const entity =
    (payload.invoice as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};

  const invoiceId = String(entity.id ?? "");
  const razorpayOrderId = entity.order_id ? String(entity.order_id) : null;
  const amountPaid = Number(entity.amount_paid ?? entity.amount_due ?? 0) / 100;

  if (!invoiceId) return;

  // Resolve recovery case via order if present
  if (razorpayOrderId) {
    const order = await prisma.order.findUnique({ where: { razorpayOrderId } });
    if (order) {
      await prisma.order.update({ where: { razorpayOrderId }, data: { status: "paid" } });

      const cases = await prisma.recoveryCase.findMany({
        where: { orderId: order.id, status: { notIn: ["RECOVERED", "STOPPED"] } },
      });
      for (const item of cases) {
        await prisma.recoveryCase.update({
          where: { id: item.id },
          data: { status: "RECOVERED", recoveredAmount: amountPaid },
        });
        await prisma.recoveryAction.updateMany({
          where: { caseId: item.id, status: { in: ["PENDING", "EXECUTING"] } },
          data: { status: "CANCELLED", error: "Cancelled after invoice.paid" },
        });
        await audit(item.id, "RECOVERY_COMPLETED", "Invoice fully paid", {
          invoiceId,
          amountPaid,
          razorpayOrderId,
        });
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// invoice.partially_paid — persist partial state, amount_due = remaining risk
// ─────────────────────────────────────────────────────────────────────────────
async function handleInvoicePartiallyPaid(payload: Record<string, unknown>) {
  const entity =
    (payload.invoice as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};

  const invoiceId = String(entity.id ?? "");
  const razorpayOrderId = entity.order_id ? String(entity.order_id) : null;
  const amountPaid = Number(entity.amount_paid ?? 0) / 100;
  const amountDue = Number(entity.amount_due ?? 0) / 100;

  if (!invoiceId || !razorpayOrderId) return;

  const order = await prisma.order.findUnique({ where: { razorpayOrderId } });
  if (!order) return;

  const cases = await prisma.recoveryCase.findMany({
    where: { orderId: order.id, status: { notIn: ["RECOVERED", "STOPPED"] } },
  });

  for (const item of cases) {
    // Partial payment — do NOT mark RECOVERED, update amounts only
    await prisma.recoveryCase.update({
      where: { id: item.id },
      data: { recoveredAmount: amountPaid, amountDue },
    });
    await audit(item.id, "PARTIAL_RECOVERY", "Invoice partially paid — amount still due", {
      invoiceId,
      amountPaid,
      amountDue,
      razorpayOrderId,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// invoice.expired — stop invoice-specific actions, keep case open for policy
// ─────────────────────────────────────────────────────────────────────────────
async function handleInvoiceExpired(payload: Record<string, unknown>) {
  const entity =
    (payload.invoice as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};

  const invoiceId = String(entity.id ?? "");
  const razorpayOrderId = entity.order_id ? String(entity.order_id) : null;
  const amountDue = Number(entity.amount_due ?? 0) / 100;

  if (!invoiceId) return;

  if (!razorpayOrderId) {
    logEvent("INVOICE_EXPIRED_NO_ORDER", { invoiceId });
    return;
  }

  const order = await prisma.order.findUnique({ where: { razorpayOrderId } });
  if (!order) return;

  const cases = await prisma.recoveryCase.findMany({
    where: { orderId: order.id, status: { notIn: ["RECOVERED", "STOPPED"] } },
  });

  for (const item of cases) {
    // Keep case open — amount_due is still at risk, policy decides next action
    await prisma.recoveryCase.update({
      where: { id: item.id },
      data: { amountDue },
    });
    await audit(item.id, "INVOICE_EXPIRED", "Invoice expired with outstanding amount", {
      invoiceId,
      amountDue,
      razorpayOrderId,
    });
  }
}

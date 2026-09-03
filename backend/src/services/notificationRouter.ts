import { prisma } from "../db/prisma.js";
import { sendEmail } from "./emailService.js";
import { sendWhatsAppText } from "./whatsappService.js";
import { audit } from "./auditService.js";

/**
 * Route a notification to WhatsApp (preferred) with Email fallback.
 *
 * Race-condition protection: reloads payment + case status before sending.
 * If the payment is already captured or the case is RECOVERED/STOPPED,
 * the notification is aborted — no message is sent.
 */
export async function routeNotification(
  caseId: string,
  channel: string | null,
  message: string,
  paymentLink: string | null,
): Promise<{ ok: boolean; reason?: string; id?: string; error?: string }> {
  // ── Re-load fresh state before any external side effect ──────────────────
  const item = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: { customer: true, payment: true },
  });

  if (!item) return { ok: false, reason: "case_not_found" };

  // Race-condition guard: payment already captured or case resolved
  if (
    item.payment.status === "captured" ||
    item.status === "RECOVERED" ||
    item.status === "STOPPED"
  ) {
    await audit(caseId, "ACTION_DENIED", "Notification suppressed — payment already resolved", {
      paymentStatus: item.payment.status,
      caseStatus: item.status,
    });
    return { ok: false, reason: "already_resolved" };
  }

  // No customer or opted out
  if (!item.customer || item.customer.communicationPreference === "NONE") {
    return { ok: false, reason: "no_channel" };
  }

  // The message already contains amount/order via buildSafeCustomerMessage —
  // do NOT append payment amount again here.
  const body = paymentLink
    ? `${message}\n\nSecure payment link: ${paymentLink}`
    : message;

  // ── WhatsApp (preferred) ─────────────────────────────────────────────────
  if (channel === "WHATSAPP" && item.customer.phone) {
    const result = await sendWhatsAppText(item.customer.phone, body);
    await prisma.recoveryAction.upsert({
      where: { caseId_action: { caseId, action: "SEND_PAYMENT_LINK" } },
      update: {
        status: result.ok ? "SENT" : "FAILED",
        providerMessageId: result.id,
        error: result.error,
        executedAt: new Date(),
      },
      create: {
        caseId,
        action: "SEND_PAYMENT_LINK",
        channel: "WHATSAPP",
        status: result.ok ? "SENT" : "FAILED",
        providerMessageId: result.id,
        error: result.error,
        executedAt: new Date(),
      },
    });
    await audit(
      caseId,
      result.ok ? "WHATSAPP_SENT" : "ACTION_FAILED",
      result.ok ? "WhatsApp notification sent" : "WhatsApp delivery failed",
      { error: result.error },
    );

    if (result.ok) return result;
    // WhatsApp failed — fall through to email fallback below
  }

  // ── Email fallback ────────────────────────────────────────────────────────
  // Runs when:
  //   a) channel === "EMAIL"
  //   b) channel === "WHATSAPP" but customer has no phone (skip, not fail)
  //   c) channel === "WHATSAPP", phone exists, but WhatsApp send failed
  if (item.customer.email) {
    const result = await sendEmail({
      to: item.customer.email,
      subject: "Action required: Your payment could not be processed",
      text: body,
    });
    await prisma.recoveryAction.upsert({
      where: { caseId_action: { caseId, action: "SEND_REMINDER" } },
      update: {
        status: result.ok ? "SENT" : "FAILED",
        error: result.error,
        executedAt: new Date(),
      },
      create: {
        caseId,
        action: "SEND_REMINDER",
        channel: "EMAIL",
        status: result.ok ? "SENT" : "FAILED",
        error: result.error,
        executedAt: new Date(),
      },
    });
    await audit(
      caseId,
      result.ok ? "EMAIL_SENT" : "ACTION_FAILED",
      result.ok ? "Email sent" : "Email delivery failed",
      { error: result.error },
    );
    return result;
  }

  return { ok: false, reason: "no_channel" };
}

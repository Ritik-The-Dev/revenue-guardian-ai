/**
 * recoveryPipeline — the authoritative recovery flow for a failed payment.
 * Used by BOTH the real Razorpay webhook handler and the demo endpoint.
 * Never duplicate this logic.
 *
 * Flow:
 *   upsert customer / order / payment
 *   → create/update RecoveryCase
 *   → build context
 *   → Pollinations AI diagnosis (+ Zod validation + deterministic fallback)
 *   → Recovery Opportunity Score
 *   → Expected Recovery Value
 *   → Deterministic Policy Engine
 *   → approved action
 *   → Bounded Action Executor
 *   → Razorpay payment link / retry / escalation
 *   → WhatsApp or SMTP Email
 *   → audit trail
 */

import { prisma } from "../db/prisma.js";
import { diagnosePayment } from "./diagnosis.js";
import type { AgentDecision } from "../schemas/agentSchemas.js";
import { calculateExpectedRecoveryValue, calculateRecoveryScore } from "./scoringService.js";
import { evaluatePolicy } from "../policy/recoveryPolicy.js";
import { audit } from "./auditService.js";
import { createPaymentLink } from "./razorpayService.js";
import { routeNotification } from "./notificationRouter.js";
import { config } from "../config.js";
import type { Prisma } from "@prisma/client";

export interface FailedPaymentInput {
  /** Razorpay payment ID */
  razorpayPaymentId: string;
  razorpayOrderId: string;
  amount: number;           // in INR (not paise)
  currency?: string;
  method?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  errorReason?: string | null;
  customer: {
    externalCustomerId?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    lifetimeValue?: number;
    successfulPayments?: number;
    failedPayments?: number;
  };
}

export async function runRecoveryPipeline(input: FailedPaymentInput) {
  // ── 1. Upsert customer ───────────────────────────────────────────────────
  const extId = input.customer.externalCustomerId ?? `rzp_${input.razorpayPaymentId}`;
  const customer = await prisma.customer.upsert({
    where: { externalCustomerId: extId },
    update: {
      name: input.customer.name ?? undefined,
      email: input.customer.email ?? undefined,
      phone: input.customer.phone ?? undefined,
    },
    create: {
      externalCustomerId: extId,
      name: input.customer.name,
      email: input.customer.email,
      phone: input.customer.phone,
      lifetimeValue: input.customer.lifetimeValue ?? 0,
      successfulPayments: input.customer.successfulPayments ?? 0,
      failedPayments: input.customer.failedPayments ?? 0,
    },
  });

  // ── 2. Upsert order ──────────────────────────────────────────────────────
  const order = await prisma.order.upsert({
    where: { razorpayOrderId: input.razorpayOrderId },
    update: {},
    create: {
      razorpayOrderId: input.razorpayOrderId,
      customerId: customer.id,
      amount: input.amount,
      currency: input.currency ?? "INR",
    },
  });

  // ── 3. Upsert payment ────────────────────────────────────────────────────
  const payment = await prisma.payment.upsert({
    where: { razorpayPaymentId: input.razorpayPaymentId },
    update: {
      status: "failed",
      errorCode: input.errorCode,
      errorDescription: input.errorDescription,
      errorReason: input.errorReason,
    },
    create: {
      razorpayPaymentId: input.razorpayPaymentId,
      razorpayOrderId: input.razorpayOrderId,
      customerId: customer.id,
      amount: input.amount,
      currency: input.currency ?? "INR",
      method: input.method,
      status: "failed",
      errorCode: input.errorCode,
      errorDescription: input.errorDescription,
      errorReason: input.errorReason,
    },
  });

  await audit(null, "PAYMENT_FAILED", "payment.failed received", {
    razorpayPaymentId: input.razorpayPaymentId,
    amount: input.amount,
    errorReason: input.errorReason,
  });

  // ── 4. Create / reset RecoveryCase ───────────────────────────────────────
  // paymentId is not @unique in schema, but we protect against concurrent
  // creation by catching the race and falling back to the existing record.
  const existing = await prisma.recoveryCase.findFirst({
    where: { paymentId: payment.id },
  });

  let recoveryCase;
  if (existing) {
    recoveryCase = await prisma.recoveryCase.update({
      where: { id: existing.id },
      data: { status: "ANALYZING", retryCount: 0 },
    });
  } else {
    try {
      recoveryCase = await prisma.recoveryCase.create({
        data: {
          paymentId: payment.id,
          orderId: order.id,
          customerId: customer.id,
          status: "ANALYZING",
        },
      });
    } catch (err) {
      // Concurrent creation race — another request created it first; find it
      const raceWinner = await prisma.recoveryCase.findFirst({
        where: { paymentId: payment.id },
      });
      if (!raceWinner) throw err; // genuine error, rethrow
      recoveryCase = await prisma.recoveryCase.update({
        where: { id: raceWinner.id },
        data: { status: "ANALYZING", retryCount: 0 },
      });
    }
  }

  // Write PAYMENT_FAILED audit with real caseId so it appears in case timeline
  await audit(recoveryCase.id, "PAYMENT_FAILED", "payment.failed received", {
    razorpayPaymentId: input.razorpayPaymentId,
    amount: input.amount,
    errorReason: input.errorReason,
  });

  await audit(recoveryCase.id, "CASE_CREATED", "Recovery case initialised", {
    paymentId: payment.id,
  });  // ── 5. Reload to get fresh counts (race-condition safety) ────────────────
  const freshCase = await prisma.recoveryCase.findUniqueOrThrow({
    where: { id: recoveryCase.id },
  });

  // Guard: if already recovered (race condition), stop.
  if (freshCase.status === "RECOVERED" || freshCase.status === "STOPPED") {
    return freshCase;
  }

  // ── 6. Retrieve customer history for context ─────────────────────────────
  const previousRecoveries = await prisma.recoveryCase.count({
    where: { customerId: customer.id, status: "RECOVERED", id: { not: recoveryCase.id } },
  });
  const previousFailures = await prisma.recoveryCase.count({
    where: { customerId: customer.id, status: "STOPPED", id: { not: recoveryCase.id } },
  });

  // ── 7. AI Diagnosis (Pollinations) ───────────────────────────────────────
  const { decision: aiDecision, usedFallback } = await diagnosePayment({
    errorReason: input.errorReason,
    errorCode: input.errorCode,
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    lifetimeValue: Number(customer.lifetimeValue),
    successfulPayments: customer.successfulPayments,
    failedPayments: customer.failedPayments,
    previousRecoveries,
    previousInterventions: previousFailures,
    orderId: input.razorpayOrderId,
    customerName: customer.name,
  });

  await audit(recoveryCase.id, "AI_DIAGNOSIS", aiDecision.reason, {
    diagnosis: aiDecision.diagnosis,
    confidence: aiDecision.confidence,
    recoverabilityProbability: aiDecision.recoverabilityProbability,
    usedFallback,
  });

  // ── 8. Recovery Opportunity Score ────────────────────────────────────────
  const recoveryScore = calculateRecoveryScore({
    amount: input.amount,
    repeatCustomer: customer.successfulPayments > 0,
    diagnosis: aiDecision.diagnosis,
    recentActivity: customer.lastSuccessfulPaymentAt
      ? Date.now() - customer.lastSuccessfulPaymentAt.getTime() < 90 * 24 * 60 * 60 * 1000
      : false,
    previousRecoverySuccess: previousRecoveries > 0,
    repeatedFailures: customer.failedPayments > 2,
    highRisk: aiDecision.diagnosis === "HIGH_RISK",
  });

  // ── 9. Expected Recovery Value ───────────────────────────────────────────
  const expectedRecoveryValue = calculateExpectedRecoveryValue(
    input.amount,
    aiDecision.recoverabilityProbability,
    aiDecision.recommendedChannel,
    aiDecision.candidateAction,
  );

  // ── 10. Load persisted policy settings (override env defaults) ───────────
  const policySettings = await prisma.policySettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  const limits = {
    maxRetryAttempts: policySettings?.maxRetryAttempts ?? config.limits.maxRetryAttempts,
    maxOutreachAttempts: policySettings?.maxOutreachAttempts ?? config.limits.maxOutreachAttempts,
    minimumRecoveryValue: Number(policySettings?.minimumRecoveryValue ?? config.limits.minimumRecoveryValue),
    highValueThreshold: Number(policySettings?.highValueThreshold ?? config.limits.highValueThreshold),
    lowConfidenceThreshold: Number(policySettings?.lowConfidenceThreshold ?? config.limits.lowConfidenceThreshold),
  };

  // ── 11. Deterministic Policy Engine ──────────────────────────────────────
  const policyResult = evaluatePolicy({
    paymentStatus: payment.status,
    orderStatus: order.status,
    diagnosis: aiDecision.diagnosis,
    confidence: aiDecision.confidence,
    score: recoveryScore,
    expectedRecoveryValue,
    retryCount: freshCase.retryCount,
    outreachCount: freshCase.outreachCount,
    hasWhatsApp: Boolean(customer.phone),
    hasEmail: Boolean(customer.email),
    amount: input.amount,
    candidateAction: aiDecision.candidateAction,
    limits,
  });

  await audit(recoveryCase.id, "POLICY_DECISION", policyResult.reason, {
    policyDecision: policyResult.decision,
    approvedAction: policyResult.action,
  });

  if (policyResult.decision === "ALLOW") {
    await audit(recoveryCase.id, "ACTION_APPROVED", `Action approved: ${policyResult.action}`, {
      action: policyResult.action,
    });
  } else {
    await audit(recoveryCase.id, "ACTION_DENIED", `Action denied: ${policyResult.reason}`, {
      policyDecision: policyResult.decision,
    });
  }

  // ── 12. Determine new case status ─────────────────────────────────────────
  const caseStatus =
    policyResult.decision === "ALLOW"
      ? "WAITING_FOR_OUTCOME"
      : policyResult.decision === "ESCALATE"
        ? "ESCALATED"
        : "STOPPED";

  // ── 13. Persist case with all diagnosis/policy data ───────────────────────
  let paymentLinkUrl: string | null = null;
  const updatedCase = await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: caseStatus,
      diagnosis: aiDecision.diagnosis,
      diagnosisConfidence: aiDecision.confidence,
      recoverabilityProbability: aiDecision.recoverabilityProbability,
      recoveryScore,
      expectedRecoveryValue,
      recommendedAction: aiDecision.candidateAction as never,
      approvedAction: policyResult.action as never,
      channel: aiDecision.recommendedChannel,
      llmReason: aiDecision.reason,
      policyDecision: policyResult.decision,
      policyReason: policyResult.reason,
      escalationReason: policyResult.decision === "ESCALATE" ? policyResult.reason : null,
      stopReason: policyResult.decision === "STOP" ? policyResult.reason : null,
    },
  });

  // ── 14. Bounded Action Executor ───────────────────────────────────────────
  if (policyResult.decision === "ALLOW") {
    const action = policyResult.action;

    if (action === "SEND_PAYMENT_LINK" || action === "REQUEST_PAYMENT_METHOD_UPDATE") {
      // Create Razorpay payment link
      try {
        const linkResult = await createPaymentLink({
          amount: input.amount,
          currency: input.currency ?? "INR",
          referenceId: input.razorpayOrderId,
          description: `Payment recovery for order ${input.razorpayOrderId}`,
        });

        if (linkResult) {
          paymentLinkUrl = linkResult.shortUrl;
          await prisma.recoveryCase.update({
            where: { id: recoveryCase.id },
            data: { paymentLinkUrl: linkResult.shortUrl, razorpayPaymentLinkId: linkResult.linkId },
          });
          await audit(recoveryCase.id, "PAYMENT_LINK_CREATED", "Razorpay payment link created", {
            url: linkResult.shortUrl,
            linkId: linkResult.linkId,
          });
        }
      } catch (err) {
        await audit(recoveryCase.id, "ACTION_FAILED", "Failed to create Razorpay payment link", {
          error: String(err),
        });
      }

      // Inject authoritative values into customer message — never trust raw LLM for these
      const safeMessage = buildSafeCustomerMessage(
        aiDecision.customerMessage,
        customer.name,
        input.razorpayOrderId,
        input.amount,
        input.currency ?? "INR",
        paymentLinkUrl,
      );

      // Route notification (WhatsApp → Email fallback)
      await routeNotification(recoveryCase.id, aiDecision.recommendedChannel, safeMessage, paymentLinkUrl);

      // Increment outreach count
      await prisma.recoveryCase.update({
        where: { id: recoveryCase.id },
        data: { outreachCount: { increment: 1 } },
      });
    } else if (action === "SCHEDULE_RETRY") {
      const delayMs = (aiDecision.delayMinutes ?? 30) * 60 * 1000;
      await prisma.recoveryCase.update({
        where: { id: recoveryCase.id },
        data: {
          nextActionAt: new Date(Date.now() + delayMs),
          retryCount: { increment: 1 },
          status: "RETRY_PENDING",
        },
      });
      await audit(recoveryCase.id, "RETRY_SCHEDULED", `Retry scheduled in ${aiDecision.delayMinutes ?? 30} minutes`, {
        nextActionAt: new Date(Date.now() + delayMs).toISOString(),
      });
    } else if (action === "SEND_REMINDER") {
      const safeMessage = buildSafeCustomerMessage(
        aiDecision.customerMessage,
        customer.name,
        input.razorpayOrderId,
        input.amount,
        input.currency ?? "INR",
        null,
      );
      await routeNotification(recoveryCase.id, aiDecision.recommendedChannel, safeMessage, null);
      await prisma.recoveryCase.update({
        where: { id: recoveryCase.id },
        data: { outreachCount: { increment: 1 } },
      });
    } else if (action === "ESCALATE") {
      await createEscalation(recoveryCase.id, input, aiDecision, policyResult.reason);
    } else if (action === "WAIT") {
      // No side effects — just record
      await audit(recoveryCase.id, "POLICY_DECISION", "Policy decided to wait", { action: "WAIT" });
    } else if (action === "STOP") {
      await prisma.recoveryCase.update({
        where: { id: recoveryCase.id },
        data: { status: "STOPPED", stopReason: policyResult.reason },
      });
      await audit(recoveryCase.id, "RECOVERY_STOPPED", policyResult.reason, {});
    }
  } else if (policyResult.decision === "ESCALATE") {
    await createEscalation(recoveryCase.id, input, aiDecision, policyResult.reason);
  } else if (policyResult.decision === "STOP") {
    await audit(recoveryCase.id, "RECOVERY_STOPPED", policyResult.reason, {});
  }

  return updatedCase;
}

/** Inject authoritative values; always include a payment link. */
function buildSafeCustomerMessage(
  llmMessage: string,
  customerName: string | null | undefined,
  orderId: string,
  amount: number,
  currency: string,
  paymentLink: string | null,
): string {
  // Always send a link — use the real one if available, else the fallback demo link
  const FALLBACK_LINK = "https://rzp.io/rzp/T45RR6DJ";
  const effectiveLink = paymentLink ?? FALLBACK_LINK;

  const greeting = customerName ? `Dear ${customerName},` : "Dear Customer,";
  const amountStr = `${currency} ${amount.toLocaleString("en-IN")}`;

  let body = llmMessage.trim() || "Your payment could not be processed. Please use the link below to complete your payment.";

  // Replace LLM placeholder patterns with the real link
  body = body
    .replace(/\{\{payment_link\}\}/gi, effectiveLink)
    .replace(/\{\{paymentLink\}\}/gi, effectiveLink)
    .replace(/\[payment link\]/gi, effectiveLink)
    .replace(/\[link\]/gi, effectiveLink);

  // If LLM says "link we've shared" but no real URL appears in body yet,
  // the actual link will be appended below — so just clean the phrasing
  if (!body.includes("rzp.io") && !body.includes("http")) {
    body = body
      .replace(/using the payment link we.ve shared\.?/gi, "using the link below")
      .replace(/via the payment link\.?/gi, "via the link below")
      .replace(/through the payment link\.?/gi, "through the link below")
      .trim();
    if (!body) {
      body = "Your payment could not be processed. Please use the link below to complete your payment.";
    }
  }

  return `${greeting}\n\n${body}\n\nOrder ID: ${orderId}\nAmount: ${amountStr}\nComplete your payment here: ${effectiveLink}`;
}

async function createEscalation(
  caseId: string,
  input: FailedPaymentInput,
  aiDecision: AgentDecision,
  reason: string,
) {
  const previousActions = await prisma.recoveryAction.findMany({ where: { caseId } });
  await prisma.escalation.upsert({
    where: { caseId },
    update: { reason },
    create: {
      caseId,
      amount: input.amount,
      customerSnapshot: {
        name: input.customer.name,
        email: input.customer.email,
        phone: input.customer.phone,
      } as Prisma.InputJsonValue,
      failure: input.errorReason,
      diagnosis: aiDecision.diagnosis,
      confidence: aiDecision.confidence,
      previousActions: previousActions.map((a) => ({
        action: a.action,
        status: a.status,
      })) as Prisma.InputJsonValue,
      reason,
      recommendedNextStep: "Review payment details and contact customer directly.",
    },
  });
  await audit(caseId, "ESCALATED", reason, { diagnosis: aiDecision.diagnosis });
}

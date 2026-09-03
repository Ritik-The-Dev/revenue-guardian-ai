/**
 * Retry Scheduler — polls for RETRY_PENDING cases where nextActionAt <= now
 * and executes them through the bounded recovery pipeline.
 *
 * Idempotency: uses DB action status (PENDING → EXECUTING → SUCCESS/FAILED/CANCELLED)
 * so two scheduler ticks cannot execute the same action simultaneously.
 *
 * No Redis, no Kafka. Simple Node setInterval is sufficient for the MVP.
 */

import { prisma } from "../db/prisma.js";
import { audit } from "./auditService.js";
import { createPaymentLink } from "./razorpayService.js";
import { routeNotification } from "./notificationRouter.js";
import { calculateExpectedRecoveryValue, calculateRecoveryScore } from "./scoringService.js";
import { evaluatePolicy } from "../policy/recoveryPolicy.js";
import { config } from "../config.js";
import { logEvent } from "../utils/logger.js";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function startRetryScheduler(): NodeJS.Timeout {
  logEvent("SCHEDULER_STARTED", { intervalMs: POLL_INTERVAL_MS });
  return setInterval(() => {
    processDueRetries().catch((err) => {
      logEvent("SCHEDULER_ERROR", { error: String(err) });
    });
  }, POLL_INTERVAL_MS);
}

async function processDueRetries() {
  const now = new Date();

  // Find all cases due for retry
  const dueCases = await prisma.recoveryCase.findMany({
    where: {
      status: "RETRY_PENDING",
      nextActionAt: { lte: now },
    },
    include: {
      payment: true,
      order: true,
      customer: true,
    },
    take: 50, // process at most 50 per tick to avoid overload
  });

  if (dueCases.length === 0) return;
  logEvent("SCHEDULER_TICK", { dueCases: dueCases.length });

  for (const recoveryCase of dueCases) {
    await processRetry(recoveryCase).catch((err) => {
      logEvent("SCHEDULER_CASE_ERROR", { caseId: recoveryCase.id, error: String(err) });
    });
  }
}

async function processRetry(recoveryCase: Awaited<ReturnType<typeof prisma.recoveryCase.findMany>>[number]) {
  // ── 1. Atomic reservation — set status to ANALYZING to prevent double execution ──
  // Only proceed if the case is still RETRY_PENDING (another worker may have grabbed it)
  const reserved = await prisma.recoveryCase.updateMany({
    where: { id: recoveryCase.id, status: "RETRY_PENDING" },
    data: { status: "ANALYZING" },
  });

  if (reserved.count === 0) {
    // Another scheduler tick already grabbed this case
    return;
  }

  // ── 2. Re-load fresh state ────────────────────────────────────────────────
  const freshCase = await prisma.recoveryCase.findUniqueOrThrow({
    where: { id: recoveryCase.id },
    include: { payment: true, order: true, customer: true },
  });

  // ── 3. Race-condition guard ───────────────────────────────────────────────
  if (
    freshCase.payment.status === "captured" ||
    freshCase.order?.status === "paid" ||
    freshCase.status === "RECOVERED" ||
    freshCase.status === "STOPPED"
  ) {
    await prisma.recoveryCase.update({
      where: { id: freshCase.id },
      data: { status: "STOPPED", stopReason: "Scheduled retry cancelled — payment already resolved" },
    });
    await prisma.recoveryAction.updateMany({
      where: { caseId: freshCase.id, status: { in: ["PENDING", "EXECUTING"] } },
      data: { status: "CANCELLED", error: "Cancelled by scheduler — payment already resolved" },
    });
    await audit(freshCase.id, "RECOVERY_STOPPED", "Scheduled retry cancelled — payment already resolved", {
      paymentStatus: freshCase.payment.status,
    });
    logEvent("SCHEDULER_CANCELLED_RESOLVED", { caseId: freshCase.id });
    return;
  }

  const customer = freshCase.customer;
  const payment = freshCase.payment;

  // ── 4. Load persisted policy settings ────────────────────────────────────
  const policySettings = await prisma.policySettings.findFirst({ orderBy: { updatedAt: "desc" } });
  const limits = {
    maxRetryAttempts: policySettings?.maxRetryAttempts ?? config.limits.maxRetryAttempts,
    maxOutreachAttempts: policySettings?.maxOutreachAttempts ?? config.limits.maxOutreachAttempts,
    minimumRecoveryValue: Number(policySettings?.minimumRecoveryValue ?? config.limits.minimumRecoveryValue),
    highValueThreshold: Number(policySettings?.highValueThreshold ?? config.limits.highValueThreshold),
    lowConfidenceThreshold: Number(policySettings?.lowConfidenceThreshold ?? config.limits.lowConfidenceThreshold),
  };

  // ── 5. Re-evaluate policy with fresh counts ───────────────────────────────
  // Use the stored diagnosis — we don't call AI again for a scheduled retry
  const diagnosis = (freshCase.diagnosis ?? "TRANSIENT_FAILURE") as never;
  const confidence = Number(freshCase.diagnosisConfidence ?? 0);
  const recoverabilityProbability = Number(freshCase.recoverabilityProbability ?? 0.5);

  const recoveryScore = calculateRecoveryScore({
    amount: Number(payment.amount),
    repeatCustomer: (customer?.successfulPayments ?? 0) > 0,
    diagnosis,
    recentActivity: false,
    previousRecoverySuccess: false,
    repeatedFailures: (customer?.failedPayments ?? 0) > 2,
    highRisk: diagnosis === "HIGH_RISK",
  });

  const expectedRecoveryValue = calculateExpectedRecoveryValue(
    Number(payment.amount),
    recoverabilityProbability,
    freshCase.channel,
    "SCHEDULE_RETRY",
  );

  const policyResult = evaluatePolicy({
    paymentStatus: payment.status,
    orderStatus: freshCase.order?.status,
    diagnosis,
    confidence,
    score: recoveryScore,
    expectedRecoveryValue,
    retryCount: freshCase.retryCount,
    outreachCount: freshCase.outreachCount,
    hasWhatsApp: Boolean(customer?.phone),
    hasEmail: Boolean(customer?.email),
    amount: Number(payment.amount),
    candidateAction: "SCHEDULE_RETRY",
    limits,
  });

  await audit(freshCase.id, "POLICY_DECISION", `Scheduled retry policy: ${policyResult.reason}`, {
    policyDecision: policyResult.decision,
    approvedAction: policyResult.action,
  });

  // ── 6. Execute approved action ────────────────────────────────────────────
  if (policyResult.decision !== "ALLOW") {
    const finalStatus = policyResult.decision === "ESCALATE" ? "ESCALATED" : "STOPPED";
    await prisma.recoveryCase.update({
      where: { id: freshCase.id },
      data: {
        status: finalStatus,
        stopReason: policyResult.decision === "STOP" ? policyResult.reason : null,
        escalationReason: policyResult.decision === "ESCALATE" ? policyResult.reason : null,
      },
    });
    await audit(freshCase.id, "RECOVERY_STOPPED", policyResult.reason, { policyDecision: policyResult.decision });
    return;
  }

  // Policy ALLOW — send payment link or notification
  let paymentLinkUrl: string | null = freshCase.paymentLinkUrl;

  if (!paymentLinkUrl) {
    try {
      const linkResult = await createPaymentLink({
        amount: Number(payment.amount),
        currency: payment.currency,
        referenceId: payment.razorpayOrderId ?? freshCase.id,
        description: `Payment recovery retry for order ${payment.razorpayOrderId ?? freshCase.id}`,
      });
      if (linkResult) {
        paymentLinkUrl = linkResult.shortUrl;
        await prisma.recoveryCase.update({
          where: { id: freshCase.id },
          data: { paymentLinkUrl: linkResult.shortUrl, razorpayPaymentLinkId: linkResult.linkId },
        });
        await audit(freshCase.id, "PAYMENT_LINK_CREATED", "Payment link created for scheduled retry", {
          url: linkResult.shortUrl,
          linkId: linkResult.linkId,
        });
      }
    } catch (err) {
      await audit(freshCase.id, "ACTION_FAILED", "Failed to create payment link for retry", { error: String(err) });
    }
  }

  const name = customer?.name ?? "Customer";
  const orderId = payment.razorpayOrderId ?? freshCase.id;
  const amount = Number(payment.amount);
  const currency = payment.currency;
  const safeMessage = `Dear ${name},\n\nWe noticed your payment of ${currency} ${amount.toLocaleString("en-IN")} for order ${orderId} is still pending. Please complete your payment at your earliest convenience.`;

  await routeNotification(freshCase.id, freshCase.channel, safeMessage, paymentLinkUrl);

  await prisma.recoveryCase.update({
    where: { id: freshCase.id },
    data: {
      status: "WAITING_FOR_OUTCOME",
      outreachCount: { increment: 1 },
      nextActionAt: null,
    },
  });

  await audit(freshCase.id, "RETRY_SCHEDULED", "Scheduled retry executed", {
    retryCount: freshCase.retryCount,
  });

  logEvent("SCHEDULER_RETRY_EXECUTED", { caseId: freshCase.id });
}

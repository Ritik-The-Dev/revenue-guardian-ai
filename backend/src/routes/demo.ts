/**
 * Demo endpoints for testing the full recovery pipeline without a real Razorpay webhook.
 * The payment.failed handler MUST use the exact same pipeline as the real webhook.
 *
 * Deployment note: these routes are unauthenticated, and because they run the
 * real pipeline they create real Razorpay payment links and send real WhatsApp
 * messages and email. `generate-batch` will do that up to 200 times in one
 * request. On a public URL that is a loaded gun, so it can be switched off with
 * `DEMO_ENDPOINTS_ENABLED=false` without touching anything else.
 *
 * The default is on, because the judge-facing demo needs it and turning it off
 * silently would be worse than leaving it documented and visible.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../db/prisma.js";
import { runRecoveryPipeline } from "../services/recoveryPipeline.js";
import { markPaymentRecovered } from "../services/recoveryVerificationService.js";
import { audit } from "../services/auditService.js";
import { logEvent } from "../utils/logger.js";

/**
 * Whether the endpoints that *execute* the pipeline are open.
 * Read per request rather than at module load so a changed environment variable
 * takes effect on the next invocation instead of the next cold start.
 */
function demoWritesEnabled(): boolean {
  return process.env.DEMO_ENDPOINTS_ENABLED?.trim().toLowerCase() !== "false";
}

/** One message, written for an operator, safe to render in the UI. */
function refuseDemoWrite(reply: FastifyReply): FastifyReply {
  logEvent("DEMO_WRITE_REFUSED", {});
  return reply.code(403).send({
    error:
      "Demo data generation is switched off on this deployment. Use the Test Agent page to run a single case, or set DEMO_ENDPOINTS_ENABLED=true.",
  });
}


// ── Synthetic batch scenarios ─────────────────────────────────────────────────

type ScenarioTemplate = {
  name: string;
  email?: string;
  phone?: string;
  lifetimeValue: number;
  successfulPayments: number;
  failedPayments: number;
  amount: number;
  method: string;
  errorReason: string;
  errorCode: string;
};

const SCENARIOS: ScenarioTemplate[] = [
  // First-time customers
  { name: "Priya Sharma", email: "priya@demo.in", phone: "919876543210", lifetimeValue: 0, successfulPayments: 0, failedPayments: 0, amount: 4999, method: "card", errorReason: "insufficient_funds", errorCode: "BAD_REQUEST_ERROR" },
  { name: "Arjun Patel", email: "arjun@demo.in", phone: "919987654321", lifetimeValue: 0, successfulPayments: 0, failedPayments: 1, amount: 1499, method: "card", errorReason: "card_expired", errorCode: "BAD_REQUEST_ERROR" },
  { name: "Sita Nair", email: "sita@demo.in", phone: "", lifetimeValue: 0, successfulPayments: 0, failedPayments: 0, amount: 799, method: "upi", errorReason: "payment_timeout", errorCode: "GATEWAY_ERROR" },
  // Repeat customers
  { name: "Rahul Mehta", email: "rahul@demo.in", phone: "919765432109", lifetimeValue: 15000, successfulPayments: 5, failedPayments: 1, amount: 3999, method: "card", errorReason: "insufficient_funds", errorCode: "BAD_REQUEST_ERROR" },
  { name: "Deepa Iyer", email: "deepa@demo.in", phone: "919654321098", lifetimeValue: 22000, successfulPayments: 8, failedPayments: 0, amount: 8999, method: "netbanking", errorReason: "bank_error", errorCode: "GATEWAY_ERROR" },
  // High-LTV customers
  { name: "Vikram Singh", email: "vikram@demo.in", phone: "919543210987", lifetimeValue: 85000, successfulPayments: 22, failedPayments: 1, amount: 29999, method: "card", errorReason: "insufficient_funds", errorCode: "BAD_REQUEST_ERROR" },
  { name: "Anita Desai", email: "anita@demo.in", phone: "919432109876", lifetimeValue: 120000, successfulPayments: 35, failedPayments: 0, amount: 49999, method: "card", errorReason: "do_not_honor", errorCode: "BAD_REQUEST_ERROR" },
  // Low-LTV customers
  { name: "Ravi Kumar", email: "ravi@demo.in", phone: "", lifetimeValue: 500, successfulPayments: 1, failedPayments: 2, amount: 299, method: "upi", errorReason: "insufficient_funds", errorCode: "BAD_REQUEST_ERROR" },
  { name: "Kavya Rao", email: "kavya@demo.in", phone: "919321098765", lifetimeValue: 1200, successfulPayments: 2, failedPayments: 1, amount: 599, method: "card", errorReason: "card_expired", errorCode: "BAD_REQUEST_ERROR" },
  // Transient failures
  { name: "Mohan Das", email: "mohan@demo.in", phone: "919210987654", lifetimeValue: 5000, successfulPayments: 3, failedPayments: 0, amount: 1999, method: "netbanking", errorReason: "network_error", errorCode: "GATEWAY_ERROR" },
  { name: "Lakshmi Pillai", email: "lakshmi@demo.in", phone: "919109876543", lifetimeValue: 7500, successfulPayments: 6, failedPayments: 1, amount: 2499, method: "upi", errorReason: "timeout", errorCode: "GATEWAY_ERROR" },
  // Authentication failures
  { name: "Suresh Babu", email: "suresh@demo.in", phone: "919098765432", lifetimeValue: 11000, successfulPayments: 4, failedPayments: 2, amount: 3499, method: "card", errorReason: "authentication_failed", errorCode: "BAD_REQUEST_ERROR" },
  { name: "Rekha Jain", email: "rekha@demo.in", phone: "918987654321", lifetimeValue: 19000, successfulPayments: 9, failedPayments: 0, amount: 6999, method: "card", errorReason: "3d_secure_failure", errorCode: "BAD_REQUEST_ERROR" },
  // High-risk cases
  { name: "Unknown User", email: "suspicious@temp.xyz", phone: "", lifetimeValue: 0, successfulPayments: 0, failedPayments: 8, amount: 99999, method: "card", errorReason: "fraud_detected", errorCode: "BAD_REQUEST_ERROR" },
  { name: "Test Account", email: "test@throwaway.io", phone: "", lifetimeValue: 0, successfulPayments: 0, failedPayments: 5, amount: 75000, method: "card", errorReason: "risk_threshold_blocked", errorCode: "BAD_REQUEST_ERROR" },
  // Repeated failures
  { name: "Harsh Varma", email: "harsh@demo.in", phone: "918876543210", lifetimeValue: 3000, successfulPayments: 2, failedPayments: 4, amount: 1799, method: "card", errorReason: "insufficient_funds", errorCode: "BAD_REQUEST_ERROR" },
  { name: "Pooja Tiwari", email: "pooja@demo.in", phone: "918765432109", lifetimeValue: 4500, successfulPayments: 3, failedPayments: 5, amount: 2299, method: "upi", errorReason: "upi_limit_exceeded", errorCode: "BAD_REQUEST_ERROR" },
];

// Pad to ~100 by cycling with random variations
function buildBatch(count: number): ScenarioTemplate[] {
  const result: ScenarioTemplate[] = [];
  const amounts = [499, 999, 1499, 2999, 4999, 9999, 14999, 24999, 49999];
  const methods = ["card", "upi", "netbanking", "wallet"];
  const errorReasons = [
    "insufficient_funds", "card_expired", "network_error", "timeout",
    "bank_error", "authentication_failed", "do_not_honor", "payment_timeout",
    "invalid_card", "fraud_detected",
  ];

  for (let i = 0; i < count; i++) {
    const base = SCENARIOS[i % SCENARIOS.length];
    const variation = i >= SCENARIOS.length;
    result.push({
      ...base,
      name: variation ? `${base.name} ${Math.ceil(i / SCENARIOS.length)}` : base.name,
      email: variation ? base.email?.replace("@demo.in", `${i}@demo.in`) : base.email,
      amount: variation ? amounts[i % amounts.length] : base.amount,
      method: variation ? methods[i % methods.length] : base.method,
      errorReason: variation ? errorReasons[i % errorReasons.length] : base.errorReason,
    });
  }
  return result;
}

export async function demoRoutes(app: FastifyInstance) {
  /**
   * POST /api/demo/payment-failed
   * Simulates a payment.failed event through the full recovery pipeline.
   */
  app.post("/api/demo/payment-failed", async (request, reply) => {
    if (!demoWritesEnabled()) return refuseDemoWrite(reply);

    const body = request.body as {
      customer?: {
        name?: string;
        email?: string;
        phone?: string;
        lifetimeValue?: number;
        successfulPayments?: number;
        failedPayments?: number;
      };
      payment?: {
        paymentId?: string;
        orderId?: string;
        amount?: number;
        currency?: string;
        method?: string;
        errorReason?: string;
        errorCode?: string;
      };
    };

    const paymentId = body?.payment?.paymentId ?? `demo_pay_${Date.now()}`;
    const orderId = body?.payment?.orderId ?? `demo_ord_${Date.now()}`;

    const result = await runRecoveryPipeline({
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      amount: body?.payment?.amount ?? 1000,
      currency: body?.payment?.currency ?? "INR",
      method: body?.payment?.method ?? null,
      errorCode: body?.payment?.errorCode ?? null,
      errorReason: body?.payment?.errorReason ?? null,
      customer: {
        externalCustomerId: body?.customer?.email ? `demo_${body.customer.email}` : `demo_${paymentId}`,
        name: body?.customer?.name ?? null,
        email: body?.customer?.email ?? null,
        phone: body?.customer?.phone ?? null,
        lifetimeValue: body?.customer?.lifetimeValue ?? 0,
        successfulPayments: body?.customer?.successfulPayments ?? 0,
        failedPayments: body?.customer?.failedPayments ?? 0,
      },
    });

    return reply.send(result);
  });

  /**
   * POST /api/demo/payment-captured
   * Marks a payment as captured and triggers recovery verification.
   */
  app.post("/api/demo/payment-captured", async (request, reply) => {
    if (!demoWritesEnabled()) return refuseDemoWrite(reply);

    const body = request.body as { paymentId: string; amount?: number };
    if (!body?.paymentId) {
      return reply.code(400).send({ error: "paymentId is required" });
    }
    try {
      const result = await markPaymentRecovered(body.paymentId, body.amount);
      return reply.send({ ok: true, paymentId: body.paymentId, status: result.status });
    } catch (err) {
      // The caught error can carry a Prisma query or a provider payload, so it
      // goes to the log and the caller gets a sentence instead.
      logEvent("DEMO_CAPTURE_FAILED", { paymentId: body.paymentId, error: String(err) });
      return reply.code(404).send({ error: "No payment with that id is being tracked." });
    }
  });

  /**
   * POST /api/demo/generate-batch
   * Generates ~100 synthetic failed payment cases through the real recovery pipeline.
   */
  app.post("/api/demo/generate-batch", async (request, reply) => {
    if (!demoWritesEnabled()) return refuseDemoWrite(reply);

    const body = (request.body ?? {}) as { count?: number };
    const count = Math.min(Number(body?.count ?? 100), 200);
    const scenarios = buildBatch(count);

    let generated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const scenario of scenarios) {
      const paymentId = `batch_pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const orderId = `batch_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      try {
        await runRecoveryPipeline({
          razorpayPaymentId: paymentId,
          razorpayOrderId: orderId,
          amount: scenario.amount,
          currency: "INR",
          method: scenario.method,
          errorReason: scenario.errorReason,
          errorCode: scenario.errorCode,
          customer: {
            externalCustomerId: `batch_${scenario.email ?? paymentId}`,
            name: scenario.name,
            email: scenario.email ?? null,
            phone: scenario.phone || null,
            lifetimeValue: scenario.lifetimeValue,
            successfulPayments: scenario.successfulPayments,
            failedPayments: scenario.failedPayments,
          },
        });
        generated++;
      } catch (err) {
        failed++;
        if (errors.length < 5) errors.push(String(err));
      }
    }

    // The raw error strings stay in the platform log — they can contain Prisma
    // queries and provider payloads. The caller gets counts only.
    if (errors.length > 0) {
      logEvent("DEMO_BATCH_ERRORS", { failed, sample: errors });
    }

    return reply.send({ ok: true, generated, failed });
  });

  /**
   * GET /api/demo/scenarios
   * Returns the list of available batch scenarios for the UI.
   */
  app.get("/api/demo/scenarios", async (_request, reply) => {
    return reply.send({ scenarios: SCENARIOS.map((s) => ({ name: s.name, amount: s.amount, errorReason: s.errorReason })) });
  });
}

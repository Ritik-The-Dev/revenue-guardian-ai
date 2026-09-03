/**
 * Test Agent endpoints — the interactive judge-facing entry point.
 *
 * These endpoints do NOT contain recovery business logic. They validate and
 * normalise operator input, enforce consent + demo abuse limits, and then hand
 * off to the exact same `runRecoveryPipeline` used by the real Razorpay
 * webhook. Every diagnosis, policy decision, payment link and notification is
 * produced by the real stack — only the originating failure event is synthetic.
 *
 * POST /api/test-agent/run          → start a run, returns identifiers immediately
 * GET  /api/test-agent/run/:id      → poll real state (run status + full case)
 * GET  /api/test-agent/scenarios    → human-labelled failure scenarios
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { runRecoveryPipeline } from "../services/recoveryPipeline.js";
import { audit } from "../services/auditService.js";
import { logEvent } from "../utils/logger.js";

// ── Failure scenarios ────────────────────────────────────────────────────────
// Human-friendly labels mapped to the real Razorpay-style error signals the
// diagnosis service and deterministic fallback already understand. The judge
// never has to know an internal error code.

interface ScenarioDefinition {
  id: string;
  label: string;
  description: string;
  method: string;
  errorCode: string;
  errorReason: string;
  errorDescription: string;
}

const SCENARIO_LIST: ScenarioDefinition[] = [
  {
    id: "insufficient_funds",
    label: "Insufficient funds",
    description: "The bank declined the payment for a low balance. Usually recoverable.",
    method: "card",
    errorCode: "BAD_REQUEST_ERROR",
    errorReason: "insufficient_funds",
    errorDescription: "Your card has insufficient funds to complete this payment.",
  },
  {
    id: "expired_card",
    label: "Expired card",
    description: "The stored payment method is no longer valid. Retrying it cannot succeed.",
    method: "card",
    errorCode: "BAD_REQUEST_ERROR",
    errorReason: "card_expired",
    errorDescription: "The card used for this payment has expired.",
  },
  {
    id: "network_failure",
    label: "Temporary / network failure",
    description: "A gateway or connectivity timeout. Often succeeds on a later attempt.",
    method: "upi",
    errorCode: "GATEWAY_ERROR",
    errorReason: "payment_timeout",
    errorDescription: "The payment request timed out at the gateway.",
  },
  {
    id: "high_risk",
    label: "High-risk / repeated failure",
    description: "Flagged by risk checks. Automatic recovery is not permitted.",
    method: "card",
    errorCode: "BAD_REQUEST_ERROR",
    errorReason: "fraud_detected",
    errorDescription: "This payment was blocked by risk checks.",
  },
  {
    id: "partial_invoice",
    label: "Partial invoice payment",
    description: "Part of an invoice was paid and a balance is still outstanding.",
    method: "netbanking",
    errorCode: "BAD_REQUEST_ERROR",
    errorReason: "invoice_partially_paid_balance_due",
    errorDescription: "The invoice was partially paid and a balance is still due.",
  },
];

const SCENARIOS = new Map(SCENARIO_LIST.map((s) => [s.id, s]));

// ── Request validation ───────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const runRequestSchema = z
  .object({
    customer: z.object({
      name: z.string().trim().min(1, "Name is required").max(80),
      phone: z.string().trim().max(20).optional().default(""),
      email: z.string().trim().max(160).optional().default(""),
      isRepeatCustomer: z.boolean().optional().default(false),
      successfulPayments: z.coerce.number().int().min(0).max(500).optional().default(0),
      lifetimeValue: z.coerce.number().min(0).max(100_000_000).optional().default(0),
      failedPayments: z.coerce.number().int().min(0).max(500).optional().default(0),
    }),
    payment: z.object({
      amount: z.coerce.number().min(1, "Amount must be at least ₹1").max(500_000),
      scenario: z.string().trim().min(1),
      currency: z.string().trim().length(3).optional().default("INR"),
    }),
    consent: z.literal(true, {
      errorMap: () => ({
        message:
          "Consent is required before the agent may contact this phone number or email address.",
      }),
    }),
  })
  .superRefine((value, ctx) => {
    const hasPhone = normalisePhone(value.customer.phone).length > 0;
    const hasEmail = EMAIL_RE.test(value.customer.email);

    if (!hasPhone && !hasEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customer"],
        message:
          "Enter a WhatsApp number or an email address so the agent has a way to reach the customer.",
      });
    }
    if (value.customer.email.length > 0 && !hasEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customer", "email"],
        message: "Enter a valid email address.",
      });
    }
    if (value.customer.phone.trim().length > 0 && !hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customer", "phone"],
        message: "Enter a valid WhatsApp number, for example +91 98765 43210.",
      });
    }
    if (!SCENARIOS.has(value.payment.scenario)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payment", "scenario"],
        message: "Select a failure scenario.",
      });
    }
  });

/**
 * Normalise an operator-entered phone number to the digits-with-country-code
 * form the WhatsApp providers expect. Returns "" when the input cannot be a
 * usable number, so callers can treat it as "no WhatsApp channel available".
 */
function normalisePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";

  // 0XXXXXXXXXX — national trunk prefix
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  // Bare 10-digit Indian mobile number
  if (digits.length === 10) digits = `91${digits}`;

  // Anything shorter than a country code + subscriber number is unusable.
  if (digits.length < 11 || digits.length > 15) return "";
  return digits;
}

/** Mask a phone number for display/audit: 9198…3210 */
function maskPhone(digits: string): string {
  if (digits.length < 8) return "•••";
  return `${digits.slice(0, 4)}${"•".repeat(Math.max(0, digits.length - 8))}${digits.slice(-4)}`;
}

/** Mask an email for audit: r••••@example.com */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const first = email.slice(0, 1);
  return `${first}${"•".repeat(Math.max(1, at - 1))}${email.slice(at)}`;
}

/**
 * Strip anything that could carry a credential out of an error string before it
 * is ever returned to a browser. The UI only ever needs to know that a stage
 * failed, not how the provider is authenticated.
 */
function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const cleaned = raw
    .replace(/[A-Za-z0-9_-]{0,12}(sk|rzp|key|token|secret)[A-Za-z0-9_\-.]{8,}/gi, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[redacted]")
    .slice(0, 240);
  return cleaned || "The recovery pipeline could not complete this run.";
}

// ── Run registry ─────────────────────────────────────────────────────────────
// The recovery pipeline awaits real network calls (Pollinations, Razorpay,
// WhatsApp/SMTP), so a run takes several seconds. We start it without blocking
// the HTTP response and keep a tiny in-memory record so the UI can distinguish
// "still working" from "the pipeline itself threw". All *business* truth still
// comes from the database — this registry only tracks process liveness.

type RunState = "RUNNING" | "COMPLETED" | "FAILED";

interface RunRecord {
  state: RunState;
  paymentId: string;
  orderId: string;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  contactSummary: { whatsapp: string | null; email: string | null };
}

const runs = new Map<string, RunRecord>();
const RUN_TTL_MS = 6 * 60 * 60 * 1000;

function pruneRuns() {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [key, record] of runs) {
    if (record.startedAt < cutoff) runs.delete(key);
  }
}

// ── Demo abuse limits ────────────────────────────────────────────────────────
// The recovery policy already bounds outreach per case. This is a separate,
// narrower guard so a publicly reachable demo page cannot be used to send
// unlimited real messages to an arbitrary phone number.

const CONTACT_WINDOW_MS = 60 * 60 * 1000;
const MAX_RUNS_PER_CONTACT = 5;
const MAX_RUNS_GLOBAL = 30;

const contactHistory = new Map<string, number[]>();
const globalHistory: number[] = [];

function withinWindow(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t < CONTACT_WINDOW_MS);
}

function checkRateLimit(contactKey: string): { ok: true } | { ok: false; message: string } {
  const now = Date.now();

  const recentGlobal = withinWindow(globalHistory, now);
  globalHistory.length = 0;
  globalHistory.push(...recentGlobal);
  if (recentGlobal.length >= MAX_RUNS_GLOBAL) {
    return {
      ok: false,
      message:
        "The test agent has reached its hourly run limit. Please try again later, or review an existing recovery case.",
    };
  }

  const recentContact = withinWindow(contactHistory.get(contactKey) ?? [], now);
  if (recentContact.length >= MAX_RUNS_PER_CONTACT) {
    return {
      ok: false,
      message: `This phone number or email address has already received ${MAX_RUNS_PER_CONTACT} test notifications in the last hour. Recovery outreach is deliberately rate limited.`,
    };
  }

  recentContact.push(now);
  contactHistory.set(contactKey, recentContact);
  globalHistory.push(now);
  return { ok: true };
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function testAgentRoutes(app: FastifyInstance) {
  /**
   * GET /api/test-agent/scenarios
   * Human-readable failure scenarios for the Test Agent form.
   */
  app.get("/api/test-agent/scenarios", async () => ({
    scenarios: SCENARIO_LIST.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    })),
  }));

  /**
   * POST /api/test-agent/checkout-order
   * Creates a real Razorpay test-mode Order so the frontend can open the
   * Razorpay Checkout modal. The tester enters failure@razorpay (UPI) or a
   * test card to trigger a payment.failed webhook which runs the real pipeline.
   * This endpoint does NOT touch the recovery pipeline at all.
   */
  app.post("/api/test-agent/checkout-order", async (request, reply) => {
    const schema = z.object({
      amount: z.coerce.number().min(1).max(500_000),
      currency: z.string().length(3).optional().default("INR"),
      name: z.string().trim().max(80).optional().default(""),
      email: z.string().trim().max(160).optional().default(""),
      phone: z.string().trim().max(20).optional().default(""),
    });

    const parsed = schema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const { amount, currency, name, email, phone } = parsed.data;

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return reply.code(503).send({ error: "Razorpay credentials are not configured." });
    }

    // Create a Razorpay order — amount is in paise
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency,
        receipt: `test_${Date.now().toString(36)}`,
      }),
    });

    if (!rzpRes.ok) {
      const err = await rzpRes.json().catch(() => ({})) as { error?: { description?: string } };
      logEvent("CHECKOUT_ORDER_FAILED", { status: rzpRes.status });
      return reply.code(502).send({
        error: err?.error?.description ?? `Razorpay order creation failed (${rzpRes.status})`,
      });
    }

    const order = await rzpRes.json() as { id: string; amount: number; currency: string };
    logEvent("CHECKOUT_ORDER_CREATED", { orderId: order.id, amount: order.amount });

    return reply.send({
      orderId: order.id,
      amount: order.amount,       // paise
      currency: order.currency,
      keyId,                       // publishable test key — safe to send to browser
      prefill: { name, email, contact: phone },
    });
  });

  /**
   * POST /api/test-agent/run
   * Validates operator input, enforces consent, then starts the real recovery
   * pipeline. Returns immediately with the identifiers needed to poll state.
   */
  app.post("/api/test-agent/run", async (request, reply) => {
    const parsed = runRequestSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "form";
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      const consentBlocked = Object.keys(fieldErrors).some((k) => k.startsWith("consent"));
      return reply.code(400).send({
        error: consentBlocked
          ? "Consent is required before the agent may send a test notification."
          : "Please correct the highlighted fields.",
        fieldErrors,
      });
    }

    const { customer, payment } = parsed.data;
    const scenario = SCENARIOS.get(payment.scenario);
    if (!scenario) {
      return reply.code(400).send({
        error: "Please correct the highlighted fields.",
        fieldErrors: { "payment.scenario": "Select a failure scenario." },
      });
    }

    const phone = normalisePhone(customer.phone);
    const email = EMAIL_RE.test(customer.email) ? customer.email.toLowerCase() : "";

    // Narrow guard on the demo surface itself — the policy engine still bounds
    // outreach per recovery case independently of this.
    const limit = checkRateLimit(phone || email);
    if (!limit.ok) {
      return reply.code(429).send({ error: limit.message });
    }

    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const paymentId = `test_pay_${stamp}`;
    const orderId = `test_ord_${stamp}`;

    // Repeat-customer context only applies when the operator asked for it.
    const successfulPayments = customer.isRepeatCustomer ? customer.successfulPayments : 0;
    const lifetimeValue = customer.isRepeatCustomer ? customer.lifetimeValue : 0;
    // The high-risk scenario is only credible with a history of failures.
    const failedPayments =
      scenario.id === "high_risk"
        ? Math.max(customer.failedPayments, 5)
        : customer.failedPayments;

    // Record consent in the durable audit trail before anything is sent.
    await audit(
      null,
      "TEST_MODE_CONSENT",
      "Operator confirmed control of the contact details and consented to a test notification.",
      {
        razorpayPaymentId: paymentId,
        scenario: scenario.id,
        whatsapp: phone ? maskPhone(phone) : null,
        email: email ? maskEmail(email) : null,
        consentedAt: new Date().toISOString(),
      },
      "CONSENT_GRANTED",
    );

    pruneRuns();
    runs.set(paymentId, {
      state: "RUNNING",
      paymentId,
      orderId,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      contactSummary: {
        whatsapp: phone ? maskPhone(phone) : null,
        email: email ? maskEmail(email) : null,
      },
    });

    logEvent("TEST_AGENT_RUN_STARTED", {
      razorpayPaymentId: paymentId,
      scenario: scenario.id,
      amount: payment.amount,
    });

    // Fire-and-forget: the pipeline performs real network I/O and can take
    // several seconds. The client polls for state rather than holding a request
    // open. Errors are captured so the UI can show a truthful failure state.
    void runRecoveryPipeline({
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      amount: payment.amount,
      currency: payment.currency,
      method: scenario.method,
      errorCode: scenario.errorCode,
      errorReason: scenario.errorReason,
      errorDescription: scenario.errorDescription,
      customer: {
        externalCustomerId: `test_${email || phone || paymentId}`,
        name: customer.name,
        email: email || null,
        phone: phone || null,
        lifetimeValue,
        successfulPayments,
        failedPayments,
      },
    })
      .then((result) => {
        const record = runs.get(paymentId);
        if (record) {
          record.state = "COMPLETED";
          record.finishedAt = Date.now();
        }
        logEvent("TEST_AGENT_RUN_COMPLETED", {
          razorpayPaymentId: paymentId,
          caseStatus: result.status,
        });
      })
      .catch((err: unknown) => {
        const record = runs.get(paymentId);
        if (record) {
          record.state = "FAILED";
          record.finishedAt = Date.now();
          record.error = safeErrorMessage(err);
        }
        logEvent("TEST_AGENT_RUN_FAILED", {
          razorpayPaymentId: paymentId,
          error: safeErrorMessage(err),
        });
      });

    return reply.code(202).send({
      ok: true,
      paymentId,
      orderId,
      scenario: { id: scenario.id, label: scenario.label },
      contact: {
        whatsapp: phone ? maskPhone(phone) : null,
        email: email ? maskEmail(email) : null,
      },
    });
  });

  /**
   * GET /api/test-agent/run/:paymentId
   * Returns real run state plus the full recovery case, so the UI can render
   * progress directly from persisted backend truth.
   */
  app.get("/api/test-agent/run/:paymentId", async (request, reply) => {
    const { paymentId } = request.params as { paymentId: string };
    if (!paymentId || paymentId.length > 120) {
      return reply.code(400).send({ error: "A valid payment reference is required." });
    }

    const record = runs.get(paymentId);

    const paymentRow = await prisma.payment.findUnique({
      where: { razorpayPaymentId: paymentId },
      select: { id: true },
    });

    if (!paymentRow) {
      if (!record) {
        return reply.code(404).send({ error: "No test run found for this reference." });
      }
      return reply.send({
        paymentId,
        orderId: record.orderId,
        run: {
          state: record.state,
          startedAt: new Date(record.startedAt).toISOString(),
          finishedAt: record.finishedAt ? new Date(record.finishedAt).toISOString() : null,
          error: record.error,
        },
        case: null,
      });
    }

    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: { paymentId: paymentRow.id },
      include: {
        customer: true,
        payment: true,
        order: true,
        actions: { orderBy: { createdAt: "asc" } },
        auditLogs: { orderBy: { createdAt: "asc" } },
        escalation: true,
      },
    });

    // A run that ended in a terminal case status is finished even if this
    // process never observed the promise settle (e.g. after a restart).
    const terminal =
      recoveryCase != null &&
      ["RECOVERED", "STOPPED", "ESCALATED", "RETRY_PENDING", "WAITING_FOR_OUTCOME"].includes(
        recoveryCase.status,
      );

    const state: RunState = record
      ? record.state
      : terminal
        ? "COMPLETED"
        : recoveryCase
          ? "RUNNING"
          : "COMPLETED";

    return reply.send({
      paymentId,
      orderId: recoveryCase?.order?.razorpayOrderId ?? record?.orderId ?? null,
      run: {
        state,
        startedAt: record ? new Date(record.startedAt).toISOString() : null,
        finishedAt: record?.finishedAt ? new Date(record.finishedAt).toISOString() : null,
        error: record?.error ?? null,
      },
      case: recoveryCase,
    });
  });
}

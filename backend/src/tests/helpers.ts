/**
 * Test helpers — in-memory mocks so tests never hit real Razorpay, Pollinations,
 * WhatsApp, or SMTP servers. All DB assertions use the real Prisma client against
 * the test DATABASE_URL.
 */

import { createHmac } from "node:crypto";
import type { AgentDecision } from "../schemas/agentSchemas.js";

// ── Razorpay signature helper ─────────────────────────────────────────────────

export function signRazorpayPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

// ── Canonical AgentDecision fixtures ─────────────────────────────────────────

export const DECISIONS = {
  softDecline: (): AgentDecision => ({
    diagnosis: "SOFT_DECLINE",
    confidence: 0.85,
    recoverabilityProbability: 0.7,
    candidateAction: "SEND_PAYMENT_LINK",
    recommendedChannel: "WHATSAPP",
    delayMinutes: 0,
    reason: "Insufficient funds — customer can retry with fresh funds.",
    customerMessage: "Your payment could not be processed due to insufficient funds.",
  }),
  expiredCard: (): AgentDecision => ({
    diagnosis: "PAYMENT_METHOD_ISSUE",
    confidence: 0.9,
    recoverabilityProbability: 0.6,
    candidateAction: "REQUEST_PAYMENT_METHOD_UPDATE",
    recommendedChannel: "EMAIL",
    delayMinutes: 0,
    reason: "Card expired — customer must update payment method.",
    customerMessage: "Your card has expired. Please update your payment method.",
  }),
  transientFailure: (): AgentDecision => ({
    diagnosis: "TRANSIENT_FAILURE",
    confidence: 0.8,
    recoverabilityProbability: 0.75,
    candidateAction: "SCHEDULE_RETRY",
    recommendedChannel: "NONE",
    delayMinutes: 30,
    reason: "Transient gateway error — automatic retry is safe.",
    customerMessage: "Your payment failed due to a temporary issue.",
  }),
  highRisk: (): AgentDecision => ({
    diagnosis: "HIGH_RISK",
    confidence: 0.95,
    recoverabilityProbability: 0.05,
    candidateAction: "ESCALATE",
    recommendedChannel: "NONE",
    delayMinutes: null,
    reason: "High-risk indicators detected.",
    customerMessage: "",
  }),
  unknown: (): AgentDecision => ({
    diagnosis: "UNKNOWN",
    confidence: 0,
    recoverabilityProbability: 0,
    candidateAction: "ESCALATE",
    recommendedChannel: "NONE",
    delayMinutes: null,
    reason: "AI provider unavailable and automatic recovery decision could not be safely determined.",
    customerMessage: "",
  }),
};

// ── Mock fetch factory ────────────────────────────────────────────────────────

export function mockPollinationsSuccess(decision: AgentDecision) {
  return async (_url: string, _opts: unknown) =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

export function mockPollinationsHttpError(status = 500) {
  return async (_url: string, _opts: unknown) =>
    new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

export function mockPollinationsInvalidJson() {
  return async (_url: string, _opts: unknown) =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: "NOT_VALID_JSON{{{{" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

export function mockPollinationsMissingFields() {
  return async (_url: string, _opts: unknown) =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ diagnosis: "SOFT_DECLINE" }) } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

export function mockWhatsAppSuccess() {
  return async (_url: string, _opts: unknown) =>
    new Response(
      JSON.stringify({ messages: [{ id: "wamid.test123" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

export function mockWhatsAppFailure() {
  return async (_url: string, _opts: unknown) =>
    new Response(
      JSON.stringify({ error: { message: "WhatsApp service unavailable" } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
}

export function mockRazorpayPaymentLinkSuccess() {
  return async (url: string, _opts: unknown) => {
    if ((url as string).includes("payment_links")) {
      return new Response(
        JSON.stringify({ short_url: "https://rzp.io/l/test123", id: "plink_test" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  };
}

export function mockRazorpayUnavailable() {
  return async (url: string, _opts: unknown) => {
    if ((url as string).includes("razorpay")) {
      return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
    }
    return new Response("{}", { status: 200 });
  };
}

// ── Payment webhook payloads ──────────────────────────────────────────────────

export function makePaymentFailedPayload(overrides: {
  paymentId?: string;
  orderId?: string;
  amount?: number;
  errorReason?: string;
  email?: string;
  contact?: string;
} = {}) {
  return {
    id: `evt_${overrides.paymentId ?? "pay_test001"}`,
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: overrides.paymentId ?? "pay_test001",
          order_id: overrides.orderId ?? "order_test001",
          amount: (overrides.amount ?? 4999) * 100,
          currency: "INR",
          method: "card",
          error_code: "BAD_REQUEST_ERROR",
          error_description: "Payment failed",
          error_reason: overrides.errorReason ?? "insufficient_funds",
          email: overrides.email ?? "test@example.com",
          contact: overrides.contact ?? "919999999999",
        },
      },
    },
  };
}

export function makePaymentCapturedPayload(paymentId: string, amount = 4999) {
  return {
    id: `evt_cap_${paymentId}`,
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount: amount * 100,
          currency: "INR",
        },
      },
    },
  };
}

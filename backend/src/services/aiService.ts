/**
 * Pollinations AI service for payment recovery diagnosis.
 * Uses the Pollinations OpenAI-compatible endpoint.
 * The rest of the application depends on RecoveryAIService — not on the provider directly.
 *
 * Default model: openai (GPT-5.4 Nano — Quest tier, free)
 * Override via POLLINATIONS_MODEL env var.
 */

import { config } from "../config.js";
import { agentDecisionSchema, type AgentDecision } from "../schemas/agentSchemas.js";

export interface RecoveryContext {
  errorReason?: string | null;
  errorCode?: string | null;
  amount: number;
  currency?: string;
  method?: string | null;
  lifetimeValue?: number;
  successfulPayments?: number;
  failedPayments?: number;
  previousRecoveries?: number;
  previousInterventions?: number;
  orderId?: string;
  customerName?: string | null;
}

export interface RecoveryAIService {
  diagnose(context: RecoveryContext): Promise<{ decision: AgentDecision; usedFallback: boolean }>;
}

const SYSTEM_PROMPT = `You are an AI payment revenue recovery decision-support agent.
Your task is to analyze a failed Razorpay payment using only the provided payment, customer, and recovery-history context.

You must:
1. Diagnose the likely failure category.
2. Estimate probability that the revenue can be recovered.
3. Recommend one candidate recovery action.
4. Recommend one communication channel if communication is appropriate.
5. Explain the recommendation.
6. Generate a customer-facing message.

Important constraints:
- You do not execute payments.
- You do not directly call Razorpay.
- You do not directly send WhatsApp.
- You do not directly send email.
- You do not modify database state.
- You may only recommend actions from the allowed action list.
- Never invent payment amounts, order IDs, customer data, or payment links.
- If payment is already captured/paid, recommend STOP.
- Never recommend automatic retry for HIGH_RISK cases.
- Never recommend retrying an expired payment method.
- Prefer the least aggressive effective intervention.
- Do not expose internal risk scores, AI reasoning, fraud classifications, recovery probability, or policy details in the customer message.

Allowed diagnoses: SOFT_DECLINE, TRANSIENT_FAILURE, PAYMENT_METHOD_ISSUE, CUSTOMER_ACTION_REQUIRED, HARD_DECLINE, HIGH_RISK, UNKNOWN
Allowed actions: SEND_PAYMENT_LINK, REQUEST_PAYMENT_METHOD_UPDATE, SCHEDULE_RETRY, SEND_REMINDER, ESCALATE, WAIT, STOP
Allowed channels: WHATSAPP, EMAIL, NONE

Return ONLY valid JSON with these fields:
{
  "diagnosis": string,
  "confidence": number (0-1),
  "recoverabilityProbability": number (0-1),
  "candidateAction": string,
  "recommendedChannel": string,
  "delayMinutes": number | null,
  "reason": string,
  "customerMessage": string
}`;

/**
 * Deterministic fallback when AI is unavailable or returns invalid output.
 * Conservative values — never takes risky autonomous financial actions.
 */
function deterministicFallback(errorReason?: string | null): AgentDecision {
  const reason = (errorReason ?? "").toLowerCase();

  if (reason.includes("expired") || reason.includes("invalid_card") || reason.includes("card_expired")) {
    return {
      diagnosis: "PAYMENT_METHOD_ISSUE",
      confidence: 0,
      recoverabilityProbability: 0.4,
      candidateAction: "REQUEST_PAYMENT_METHOD_UPDATE",
      recommendedChannel: "EMAIL",
      delayMinutes: 0,
      reason: "Deterministic fallback: expired/invalid payment method detected.",
      customerMessage: "Your payment could not be completed. Please update your payment method and try again.",
    };
  }

  if (reason.includes("insufficient") || reason.includes("low_balance")) {
    return {
      diagnosis: "SOFT_DECLINE",
      confidence: 0,
      recoverabilityProbability: 0.5,
      candidateAction: "SEND_PAYMENT_LINK",
      recommendedChannel: "WHATSAPP",
      delayMinutes: 60,
      reason: "Deterministic fallback: insufficient funds detected.",
      customerMessage: "Your payment could not be processed. Please ensure sufficient funds and try again.",
    };
  }

  if (reason.includes("timeout") || reason.includes("network") || reason.includes("gateway") || reason.includes("bank_error")) {
    return {
      diagnosis: "TRANSIENT_FAILURE",
      confidence: 0,
      recoverabilityProbability: 0.6,
      candidateAction: "SCHEDULE_RETRY",
      recommendedChannel: "NONE",
      delayMinutes: 30,
      reason: "Deterministic fallback: transient network/gateway error detected.",
      customerMessage: "Your payment failed due to a temporary issue. We will retry automatically.",
    };
  }

  if (reason.includes("fraud") || reason.includes("risk") || reason.includes("blocked")) {
    return {
      diagnosis: "HIGH_RISK",
      confidence: 0,
      recoverabilityProbability: 0,
      candidateAction: "ESCALATE",
      recommendedChannel: "NONE",
      delayMinutes: null,
      reason: "Deterministic fallback: high-risk or fraud signal detected.",
      customerMessage: "",
    };
  }

  // Safe conservative default
  return {
    diagnosis: "UNKNOWN",
    confidence: 0,
    recoverabilityProbability: 0,
    candidateAction: "ESCALATE",
    recommendedChannel: "NONE",
    delayMinutes: null,
    reason: "AI provider unavailable and automatic recovery decision could not be safely determined.",
    customerMessage: "",
  };
}

class PollinationsAIService implements RecoveryAIService {
  // Allow test injection of fetch — production uses global fetch
  private _fetch: typeof fetch;

  constructor(fetchImpl?: typeof fetch) {
    this._fetch = fetchImpl ?? globalThis.fetch;
  }

  async diagnose(context: RecoveryContext): Promise<{ decision: AgentDecision; usedFallback: boolean }> {
    const apiKey = config.pollinationsApiKey;
    const model = config.pollinationsModel;

    if (!apiKey) {
      return { decision: deterministicFallback(context.errorReason), usedFallback: true };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Use globalThis.fetch so vi.stubGlobal('fetch', ...) works in tests
        const response = await globalThis.fetch("https://gen.pollinations.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: JSON.stringify(context) },
            ],
            temperature: 0.2,
            top_p: 0.9,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`Pollinations HTTP ${response.status}: ${text}`);
        }

        const json = await response.json() as { choices?: { message?: { content?: string } }[] };
        const content = json?.choices?.[0]?.message?.content;
        if (!content) throw new Error("Empty content from Pollinations");

        const parsed = agentDecisionSchema.safeParse(JSON.parse(content));
        if (parsed.success) return { decision: parsed.data, usedFallback: false };

        // Invalid schema — retry once
        if (attempt < 1) continue;
      } catch {
        if (attempt < 1) continue;
      }
    }

    return { decision: deterministicFallback(context.errorReason), usedFallback: true };
  }
}

// Singleton — the rest of the application imports this
export const aiService: RecoveryAIService = new PollinationsAIService();

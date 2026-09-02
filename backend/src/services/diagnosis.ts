import OpenAI from "openai";
import { config } from "../config.js";
import { agentDecisionSchema, type AgentDecision } from "../schemas/agentSchemas.js";

const fallback = (reason: string): AgentDecision => ({ diagnosis: reason.toLowerCase().includes("expired") ? "PAYMENT_METHOD_ISSUE" : reason.toLowerCase().includes("insufficient") ? "SOFT_DECLINE" : reason.toLowerCase().includes("network") || reason.toLowerCase().includes("timeout") ? "TRANSIENT_FAILURE" : "UNKNOWN", confidence: 0.35, recoverabilityProbability: 0.25, candidateAction: "ESCALATE", recommendedChannel: "NONE", delayMinutes: null, reason: "Deterministic fallback used because the model was unavailable.", customerMessage: "We could not complete your payment. Please try again or contact support." });

export async function diagnosePayment(context: Record<string, unknown>): Promise<{ decision: AgentDecision; usedFallback: boolean }> {
  if (!config.openAiKey) return { decision: fallback(String(context.errorReason ?? "unknown")), usedFallback: true };
  const client = new OpenAI({ apiKey: config.openAiKey, baseURL: "https://ai.gateway.lovable.dev/v1" });
  const prompt = `You are a payment revenue recovery decision-support agent. Diagnose one failed payment using only supplied facts. You do not execute payments or communication. Prefer the least aggressive effective intervention. Never recommend an automatic retry for HIGH_RISK cases or an expired payment method. Return only JSON matching the requested fields. Facts: ${JSON.stringify(context)}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await client.chat.completions.create({ model: config.openAiModel, reasoning_effort: "none", response_format: { type: "json_object" }, messages: [{ role: "system", content: prompt }], temperature: 0 });
      const parsed = agentDecisionSchema.safeParse(JSON.parse(response.choices[0]?.message.content ?? "{}"));
      if (parsed.success) return { decision: parsed.data, usedFallback: false };
    } catch { /* retry once, then use safe fallback */ }
  }
  return { decision: fallback(String(context.errorReason ?? "unknown")), usedFallback: true };
}
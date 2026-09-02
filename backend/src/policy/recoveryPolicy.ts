import type { AgentDecision } from "../schemas/agentSchemas.js";
import { config } from "../config.js";

export type PolicyDecision = "ALLOW" | "DENY" | "ESCALATE" | "STOP";
export type ApprovedAction = AgentDecision["candidateAction"];

export type PolicyInput = {
  paymentStatus: string;
  orderStatus?: string;
  diagnosis: AgentDecision["diagnosis"];
  confidence: number;
  score: number;
  expectedRecoveryValue: number;
  retryCount: number;
  outreachCount: number;
  hasWhatsApp: boolean;
  hasEmail: boolean;
  amount: number;
  candidateAction: ApprovedAction;
};

export function evaluatePolicy(input: PolicyInput): { decision: PolicyDecision; action: ApprovedAction; reason: string } {
  if (input.paymentStatus === "captured" || input.orderStatus === "paid") return { decision: "STOP", action: "STOP", reason: "Payment is already recovered." };
  if (input.outreachCount >= config.limits.maxOutreachAttempts) return { decision: "STOP", action: "STOP", reason: "Maximum outreach attempts reached." };
  if (input.retryCount >= config.limits.maxRetryAttempts) return { decision: "STOP", action: "STOP", reason: "Maximum retry attempts reached." };
  if (input.diagnosis === "HIGH_RISK") return { decision: "ESCALATE", action: "ESCALATE", reason: "High-risk failure requires human review." };
  if (input.expectedRecoveryValue < config.limits.minimumRecoveryValue) return { decision: "STOP", action: "STOP", reason: "Expected recovery value is below the merchant minimum." };
  if (input.confidence < config.limits.lowConfidenceThreshold) return { decision: "ESCALATE", action: "ESCALATE", reason: "AI confidence is below the merchant threshold." };
  if (input.diagnosis === "PAYMENT_METHOD_ISSUE") return { decision: "ALLOW", action: input.hasWhatsApp || input.hasEmail ? "REQUEST_PAYMENT_METHOD_UPDATE" : "STOP", reason: "Expired or invalid payment method must be updated before retry." };
  if (input.diagnosis === "TRANSIENT_FAILURE") return { decision: "ALLOW", action: "SCHEDULE_RETRY", reason: "Transient processor issue is eligible for a bounded retry." };
  if (input.diagnosis === "SOFT_DECLINE") return { decision: "ALLOW", action: input.amount >= config.limits.highValueThreshold ? "SEND_PAYMENT_LINK" : "SCHEDULE_RETRY", reason: "Soft decline is recoverable with the least aggressive approved action." };
  if (input.diagnosis === "HARD_DECLINE" || input.diagnosis === "UNKNOWN") return { decision: "ESCALATE", action: "ESCALATE", reason: "Failure is not safe for autonomous recovery." };
  return { decision: "ALLOW", action: input.candidateAction, reason: "Candidate action passed bounded policy checks." };
}
import type { AgentDecision } from "../schemas/agentSchemas.js";
import { config } from "../config.js";

export type PolicyDecision = "ALLOW" | "DENY" | "ESCALATE" | "STOP";
export type ApprovedAction = AgentDecision["candidateAction"];

export interface PolicyLimits {
  maxRetryAttempts?: number;
  maxOutreachAttempts?: number;
  minimumRecoveryValue?: number;
  highValueThreshold?: number;
  lowConfidenceThreshold?: number;
}

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
  /** Optional runtime overrides from persisted PolicySettings */
  limits?: PolicyLimits;
};

export function evaluatePolicy(
  input: PolicyInput,
): { decision: PolicyDecision; action: ApprovedAction; reason: string } {
  // Merge runtime limits with env defaults
  const limits = {
    maxRetryAttempts: input.limits?.maxRetryAttempts ?? config.limits.maxRetryAttempts,
    maxOutreachAttempts: input.limits?.maxOutreachAttempts ?? config.limits.maxOutreachAttempts,
    minimumRecoveryValue: input.limits?.minimumRecoveryValue ?? config.limits.minimumRecoveryValue,
    highValueThreshold: input.limits?.highValueThreshold ?? config.limits.highValueThreshold,
    lowConfidenceThreshold: input.limits?.lowConfidenceThreshold ?? config.limits.lowConfidenceThreshold,
  };

  // Already recovered / paid — hard stop, no exceptions
  if (input.paymentStatus === "captured" || input.orderStatus === "paid") {
    return { decision: "STOP", action: "STOP", reason: "Payment is already recovered." };
  }

  // Outreach limit
  if (input.outreachCount >= limits.maxOutreachAttempts) {
    return { decision: "STOP", action: "STOP", reason: "Maximum outreach attempts reached." };
  }

  // Retry limit
  if (input.retryCount >= limits.maxRetryAttempts) {
    return { decision: "STOP", action: "STOP", reason: "Maximum retry attempts reached." };
  }

  // High-risk — never automatic recovery
  if (input.diagnosis === "HIGH_RISK") {
    return { decision: "ESCALATE", action: "ESCALATE", reason: "High-risk failure requires human review." };
  }

  // ERV below merchant minimum
  if (input.expectedRecoveryValue < limits.minimumRecoveryValue) {
    return {
      decision: "STOP",
      action: "STOP",
      reason: "Expected recovery value is below the merchant minimum.",
    };
  }

  // Low AI confidence — escalate unless we have a safe deterministic path
  if (input.confidence < limits.lowConfidenceThreshold) {
    if (input.diagnosis === "TRANSIENT_FAILURE") {
      return { decision: "ALLOW", action: "SCHEDULE_RETRY", reason: "Low confidence but transient failure allows bounded retry." };
    }
    return { decision: "ESCALATE", action: "ESCALATE", reason: "AI confidence is below the merchant threshold." };
  }

  // Payment method expired / invalid — never blind retry
  if (input.diagnosis === "PAYMENT_METHOD_ISSUE") {
    const action: ApprovedAction =
      input.hasWhatsApp || input.hasEmail ? "REQUEST_PAYMENT_METHOD_UPDATE" : "STOP";
    return {
      decision: action === "STOP" ? "STOP" : "ALLOW",
      action,
      reason: "Expired or invalid payment method must be updated before retry.",
    };
  }

  // Transient failure — bounded retry
  if (input.diagnosis === "TRANSIENT_FAILURE") {
    return {
      decision: "ALLOW",
      action: "SCHEDULE_RETRY",
      reason: "Transient processor issue is eligible for a bounded retry.",
    };
  }

  // Soft decline — prefer payment link for high-value, retry for lower
  if (input.diagnosis === "SOFT_DECLINE") {
    const action: ApprovedAction =
      input.amount >= limits.highValueThreshold ? "SEND_PAYMENT_LINK" : "SCHEDULE_RETRY";
    return {
      decision: "ALLOW",
      action,
      reason: "Soft decline is recoverable with the least aggressive approved action.",
    };
  }

  // Customer action required — send payment link if channel available
  if (input.diagnosis === "CUSTOMER_ACTION_REQUIRED") {
    const action: ApprovedAction =
      input.hasWhatsApp || input.hasEmail ? "SEND_PAYMENT_LINK" : "ESCALATE";
    return {
      decision: action === "ESCALATE" ? "ESCALATE" : "ALLOW",
      action,
      reason: "Customer must take action to complete the payment.",
    };
  }

  // Hard decline or unknown — escalate for human review
  if (input.diagnosis === "HARD_DECLINE" || input.diagnosis === "UNKNOWN") {
    return { decision: "ESCALATE", action: "ESCALATE", reason: "Failure is not safe for autonomous recovery." };
  }

  // Fallthrough — trust the policy-approved candidate action
  return {
    decision: "ALLOW",
    action: input.candidateAction,
    reason: "Candidate action passed bounded policy checks.",
  };
}

import { z } from "zod";

export const agentDecisionSchema = z.object({
  diagnosis: z.enum(["SOFT_DECLINE", "TRANSIENT_FAILURE", "PAYMENT_METHOD_ISSUE", "CUSTOMER_ACTION_REQUIRED", "HARD_DECLINE", "HIGH_RISK", "UNKNOWN"]),
  confidence: z.number().min(0).max(1),
  recoverabilityProbability: z.number().min(0).max(1),
  candidateAction: z.enum(["SEND_PAYMENT_LINK", "REQUEST_PAYMENT_METHOD_UPDATE", "SCHEDULE_RETRY", "SEND_REMINDER", "ESCALATE", "WAIT", "STOP"]),
  recommendedChannel: z.enum(["WHATSAPP", "EMAIL", "NONE"]),
  delayMinutes: z.number().min(0).nullable(),
  reason: z.string(),
  customerMessage: z.string(),
});

export type AgentDecision = z.infer<typeof agentDecisionSchema>;
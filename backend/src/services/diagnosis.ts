/**
 * diagnosePayment — thin wrapper that delegates to the RecoveryAIService abstraction.
 * Import this throughout the application; never import aiService directly from routes.
 */

import { aiService, type RecoveryContext } from "./aiService.js";
import type { AgentDecision } from "../schemas/agentSchemas.js";

export type { AgentDecision };

export async function diagnosePayment(
  context: RecoveryContext,
): Promise<{ decision: AgentDecision; usedFallback: boolean }> {
  return aiService.diagnose(context);
}

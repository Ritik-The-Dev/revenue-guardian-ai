export function calculateRecoveryScore(input: { amount: number; repeatCustomer: boolean; diagnosis: string; recentActivity: boolean; previousRecoverySuccess: boolean; repeatedFailures: boolean; highRisk: boolean }) {
  let score = 0;
  if (input.amount >= 25000) score += 25;
  if (input.repeatCustomer) score += 20;
  if (["SOFT_DECLINE", "TRANSIENT_FAILURE", "CUSTOMER_ACTION_REQUIRED"].includes(input.diagnosis)) score += 20;
  if (input.recentActivity) score += 15;
  if (input.previousRecoverySuccess) score += 10;
  if (input.repeatedFailures) score -= 20;
  if (input.highRisk) score -= 50;
  return Math.max(0, Math.min(100, score));
}

export function calculateExpectedRecoveryValue(amount: number, probability: number, channel: string | null, action: string) {
  const interventionCost = action === "SCHEDULE_RETRY" ? 2 : action === "ESCALATE" ? 20 : channel === "WHATSAPP" ? 1 : channel === "EMAIL" ? 0.5 : 0;
  return Math.round((amount * probability - interventionCost) * 100) / 100;
}
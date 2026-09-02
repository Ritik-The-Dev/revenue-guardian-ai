import { prisma } from "../db/prisma.js";

export async function audit(caseId: string | null, eventType: string, reason: string | null, metadata: Record<string, unknown> = {}, decision?: string) {
  return prisma.auditLog.create({ data: { caseId, eventType, reason, decision, metadata } });
}
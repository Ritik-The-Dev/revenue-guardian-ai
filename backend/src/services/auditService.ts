import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";

export async function audit(
  caseId: string | null,
  eventType: string,
  reason: string | null,
  metadata: Record<string, unknown> = {},
  decision?: string,
) {
  return prisma.auditLog.create({
    data: {
      caseId,
      eventType,
      reason,
      decision,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

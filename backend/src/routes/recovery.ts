import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { audit } from "../services/auditService.js";
import type { Prisma } from "@prisma/client";

export async function recoveryRoutes(app: FastifyInstance) {
  // List cases with optional status filter + pagination
  app.get("/api/recovery/cases", async (request) => {
    const query = request.query as { status?: string; page?: string; limit?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
    const where = query.status ? { status: query.status as never } : {};
    const [cases, total] = await Promise.all([
      prisma.recoveryCase.findMany({
        where,
        include: { customer: true, payment: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.recoveryCase.count({ where }),
    ]);
    return { cases, total, page, limit };
  });

  // Single case detail
  app.get("/api/recovery/cases/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await prisma.recoveryCase.findUnique({
      where: { id },
      include: {
        customer: true,
        payment: true,
        order: true,
        actions: true,
        auditLogs: { orderBy: { createdAt: "asc" } },
        escalation: true,
      },
    });
    return item ? item : reply.code(404).send({ error: "Not found" });
  });

  // Stop a case
  app.post("/api/recovery/cases/:id/stop", async (request) => {
    const { id } = request.params as { id: string };
    const reason =
      ((request.body ?? {}) as { reason?: string }).reason ?? "Stopped by merchant";
    const item = await prisma.recoveryCase.update({
      where: { id },
      data: { status: "STOPPED", stopReason: reason },
    });
    await prisma.recoveryAction.updateMany({
      where: { caseId: id, status: { in: ["PENDING", "EXECUTING"] } },
      data: { status: "CANCELLED", error: reason },
    });
    await audit(id, "RECOVERY_STOPPED", reason);
    return item;
  });

  // Manually escalate a case
  app.post("/api/recovery/cases/:id/escalate", async (request) => {
    const { id } = request.params as { id: string };
    const item = await prisma.recoveryCase.update({
      where: { id },
      data: { status: "ESCALATED", escalationReason: "Manual escalation" },
      include: { customer: true, payment: true },
    });
    await prisma.escalation.upsert({
      where: { caseId: id },
      update: { reason: "Manual escalation" },
      create: {
        caseId: id,
        amount: item.payment.amount,
        customerSnapshot: (item.customer ?? {}) as Prisma.InputJsonValue,
        failure: item.payment.errorReason,
        diagnosis: item.diagnosis,
        confidence: item.diagnosisConfidence,
        previousActions: [] as Prisma.InputJsonValue,
        reason: "Manual escalation",
        recommendedNextStep: "Review payment method and contact customer",
      },
    });
    await audit(id, "ESCALATED", "Manual escalation requested");
    return item;
  });
}

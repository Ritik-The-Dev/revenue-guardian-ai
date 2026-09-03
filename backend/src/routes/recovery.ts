import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { audit } from "../services/auditService.js";
import type { Prisma } from "@prisma/client";

export async function recoveryRoutes(app: FastifyInstance) {
  // List cases with optional filters + pagination.
  // Filters are read-only query narrowing — they do not alter recovery behaviour.
  app.get("/api/recovery/cases", async (request) => {
    const query = request.query as {
      status?: string;
      page?: string;
      limit?: string;
      q?: string;
      diagnosis?: string;
      channel?: string;
      source?: string;
      from?: string;
      to?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));

    const and: Prisma.RecoveryCaseWhereInput[] = [];

    if (query.status) and.push({ status: query.status as never });
    if (query.diagnosis) and.push({ diagnosis: query.diagnosis });
    if (query.channel) and.push({ channel: query.channel });

    // Free-text search across the customer and the payment reference.
    const term = query.q?.trim();
    if (term) {
      and.push({
        OR: [
          { customer: { name: { contains: term, mode: "insensitive" } } },
          { customer: { email: { contains: term, mode: "insensitive" } } },
          { customer: { phone: { contains: term } } },
          { payment: { razorpayPaymentId: { contains: term, mode: "insensitive" } } },
          { order: { razorpayOrderId: { contains: term, mode: "insensitive" } } },
        ],
      });
    }

    // Origin of the underlying event, derived from the payment reference prefix.
    // batch_ = synthetic evaluation data, test_/demo_ = operator-triggered test
    // runs, anything else came from a real Razorpay webhook.
    if (query.source === "synthetic") {
      and.push({ payment: { razorpayPaymentId: { startsWith: "batch_" } } });
    } else if (query.source === "test") {
      and.push({
        OR: [
          { payment: { razorpayPaymentId: { startsWith: "test_" } } },
          { payment: { razorpayPaymentId: { startsWith: "demo_" } } },
        ],
      });
    } else if (query.source === "live") {
      and.push({
        NOT: {
          OR: [
            { payment: { razorpayPaymentId: { startsWith: "batch_" } } },
            { payment: { razorpayPaymentId: { startsWith: "test_" } } },
            { payment: { razorpayPaymentId: { startsWith: "demo_" } } },
          ],
        },
      });
    }

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
    if (to && !Number.isNaN(to.getTime())) {
      // Treat an end date as inclusive of that whole day.
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      and.push({ createdAt: { lte: end } });
    }

    const where: Prisma.RecoveryCaseWhereInput = and.length > 0 ? { AND: and } : {};

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

import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { z } from "zod";

const settingsSchema = z.object({
  maxRetryAttempts: z.number().int().min(0).max(10).optional(),
  maxOutreachAttempts: z.number().int().min(0).max(10).optional(),
  cooldownHours: z.number().int().min(0).max(720).optional(),
  minimumRecoveryValue: z.number().min(0).optional(),
  highValueThreshold: z.number().min(0).optional(),
  lowConfidenceThreshold: z.number().min(0).max(1).optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings", async () => {
    const settings = await prisma.policySettings.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!settings) {
      // Return defaults if no record exists yet
      return {
        maxRetryAttempts: 2,
        maxOutreachAttempts: 2,
        cooldownHours: 24,
        minimumRecoveryValue: 100,
        highValueThreshold: 25000,
        lowConfidenceThreshold: 0.6,
      };
    }
    return settings;
  });

  app.post("/api/settings", async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid settings", details: parsed.error.flatten() });
    }

    const existing = await prisma.policySettings.findFirst({ orderBy: { updatedAt: "desc" } });

    if (existing) {
      const updated = await prisma.policySettings.update({
        where: { id: existing.id },
        data: parsed.data,
      });
      return updated;
    }

    const created = await prisma.policySettings.create({ data: parsed.data });
    return created;
  });
}

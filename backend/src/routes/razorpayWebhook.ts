import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { config } from "../config.js";
import { sha256, verifyRazorpaySignature } from "../utils/idempotency.js";
import { webhookEnvelopeSchema } from "../schemas/webhookSchemas.js";
import { markPaymentRecovered } from "../services/recoveryVerificationService.js";

export async function razorpayWebhookRoute(app: FastifyInstance) {
  app.post("/api/webhooks/razorpay", async (request, reply) => {
    const raw = typeof request.rawBody === "string" ? request.rawBody : JSON.stringify(request.body ?? {});
    if (!verifyRazorpaySignature(raw, request.headers["x-razorpay-signature"] as string | undefined, config.razorpayWebhookSecret)) return reply.code(401).send({ error: "Invalid signature" });
    const parsed = webhookEnvelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return reply.code(400).send({ error: "Invalid Razorpay payload" });
    const eventId = parsed.data.id ?? sha256(raw);
    const existing = await prisma.webhookEvent.findUnique({ where: { razorpayEventId: eventId } });
    if (existing) return reply.code(200).send({ ok: true, duplicate: true });
    await prisma.webhookEvent.create({ data: { razorpayEventId: eventId, eventType: parsed.data.event, payloadHash: sha256(raw), rawPayload: parsed.data.payload } });
    if (parsed.data.event === "payment.captured") {
      const entity = parsed.data.payload.payment as { entity?: { id?: string; amount?: number } } | undefined;
      if (entity?.entity?.id) await markPaymentRecovered(entity.entity.id, entity.entity.amount ? entity.entity.amount / 100 : undefined);
    }
    await prisma.webhookEvent.update({ where: { razorpayEventId: eventId }, data: { status: "PROCESSED", processedAt: new Date() } });
    return reply.send({ ok: true });
  });
}
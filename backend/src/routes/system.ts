/**
 * System status — a small, safe surface for the UI health indicator.
 *
 * This endpoint returns booleans and mode labels only. It must never return
 * key material, environment values, connection strings or provider responses.
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { config } from "../config.js";

function isConfigured(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function systemRoutes(app: FastifyInstance) {
  /**
   * GET /api/system/status
   * Reports whether the agent is operational and which integrations are wired.
   */
  app.get("/api/system/status", async (_request, reply) => {
    let database = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }

    const razorpay = isConfigured(config.razorpayKeyId) && isConfigured(config.razorpayKeySecret);
    const whatsapp =
      isConfigured(process.env.WHATSAPP_SEND_API_KEY) ||
      (isConfigured(process.env.WHATSAPP_ACCESS_TOKEN) &&
        isConfigured(process.env.WHATSAPP_PHONE_NUMBER_ID));
    const email = isConfigured(process.env.SMTP_HOST) && isConfigured(process.env.SMTP_USERNAME);

    // Razorpay test keys are prefixed rzp_test_; anything else is treated as live.
    const razorpayMode = !razorpay
      ? "not_configured"
      : config.razorpayKeyId?.startsWith("rzp_test_")
        ? "test"
        : "live";

    return reply.send({
      // The agent can evaluate and decide as long as the database is reachable.
      // AI has a deterministic fallback, so it is never a hard dependency.
      operational: database,
      database,
      integrations: {
        razorpay,
        // Pollinations falls back to deterministic diagnosis when unavailable.
        ai: isConfigured(config.pollinationsApiKey),
        aiFallbackAvailable: true,
        whatsapp,
        email,
        webhookVerification: isConfigured(config.razorpayWebhookSecret),
      },
      razorpayMode,
      limits: {
        maxRetryAttempts: config.limits.maxRetryAttempts,
        maxOutreachAttempts: config.limits.maxOutreachAttempts,
      },
      checkedAt: new Date().toISOString(),
    });
  });
}

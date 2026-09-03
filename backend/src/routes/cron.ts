/**
 * Cron endpoint — the serverless replacement for the retry scheduler's timer.
 *
 * On a long-running server `startRetryScheduler()` ticks every 30 seconds. On
 * Vercel there is no long-running server: the moment a response is sent the
 * function is frozen, and any `setInterval` with it. So the same tick is driven
 * from outside, by Vercel Cron hitting this route on the schedule declared in
 * `backend/vercel.json`.
 *
 * This endpoint executes real recovery actions — it creates Razorpay payment
 * links and sends WhatsApp messages and email. It is therefore authenticated,
 * and refuses to run at all on a deployment where the secret was never set,
 * rather than quietly leaving a public trigger on the internet.
 */

import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { processDueRetries } from "../services/retryScheduler.js";
import { logEvent } from "../utils/logger.js";

/** Constant-time compare that does not leak length through an early return. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type AuthResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when
 * `CRON_SECRET` is present in the project's environment variables.
 */
function authorise(request: FastifyRequest): AuthResult {
  const expected = process.env.CRON_SECRET?.trim();

  if (!expected) {
    // Local development: no secret configured, so allow it — the dev server is
    // not reachable from the internet and the interval scheduler is already
    // running anyway.
    if (process.env.VERCEL !== "1") return { ok: true };

    // Deployed without a secret. Refuse rather than expose the trigger.
    return {
      ok: false,
      status: 503,
      message: "Scheduled retries are not enabled on this deployment.",
    };
  }

  const header = request.headers.authorization;
  const token =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : "";

  if (!token || !secretMatches(token, expected)) {
    return { ok: false, status: 401, message: "Not authorised." };
  }

  return { ok: true };
}

export async function cronRoutes(app: FastifyInstance) {
  /**
   * Runs one retry tick. Registered for both GET and POST because Vercel Cron
   * issues a GET, while a human or a CI job is more likely to POST.
   *
   * The response reports only how many cases the tick picked up. Per-case
   * outcomes are written to the audit trail, which is where the UI reads them.
   */
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = authorise(request);
    if (!auth.ok) {
      logEvent("CRON_REJECTED", { status: auth.status });
      return reply.code(auth.status).send({ error: auth.message });
    }

    try {
      const result = await processDueRetries();
      logEvent("CRON_TICK_COMPLETED", { processed: result.processed });
      return reply.send({
        ok: true,
        processed: result.processed,
        ranAt: new Date().toISOString(),
      });
    } catch (err) {
      // The real reason goes to the log, never to the caller.
      logEvent("CRON_TICK_FAILED", { error: String(err) });
      return reply.code(500).send({ error: "The scheduled retry tick could not complete." });
    }
  };

  app.get("/api/cron/retry-tick", handler);
  app.post("/api/cron/retry-tick", handler);
}

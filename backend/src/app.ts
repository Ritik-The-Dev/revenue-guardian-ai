/**
 * The Fastify application, built once and shared by every entry point.
 *
 * There are two ways this backend runs, and they must expose exactly the same
 * surface:
 *
 *   - `server.ts`  — a long-lived Node process for local development, which
 *                    also runs the retry scheduler on an interval.
 *   - `vercel.ts`  — a serverless function, where nothing survives between
 *                    invocations and the scheduler runs from Vercel Cron.
 *
 * Route registration used to be duplicated across those two files, and they
 * drifted: the serverless entry was missing the Test Agent and system-status
 * routes, so the judge-facing flow returned 404 in production while working
 * perfectly on localhost. Registration now lives here and nowhere else, so
 * that class of bug cannot come back.
 */

import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { razorpayWebhookRoute } from "./routes/razorpayWebhook.js";
import { recoveryRoutes } from "./routes/recovery.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { demoRoutes } from "./routes/demo.js";
import { settingsRoutes } from "./routes/settings.js";
import { testAgentRoutes } from "./routes/testAgent.js";
import { systemRoutes } from "./routes/system.js";
import { cronRoutes } from "./routes/cron.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBodyBuffer?: Buffer;
  }
}

/**
 * Origins allowed to call this API from a browser.
 *
 * `CORS_ALLOWED_ORIGINS` is a comma-separated list, e.g.
 * `https://revenue-guardian.vercel.app,http://localhost:5173`.
 *
 * When it is unset the API answers `*`, which is what local development and a
 * plain `curl` need. On a public deployment you should set it: the demo and
 * Test Agent endpoints trigger real WhatsApp and email sends, and an open
 * origin policy invites a stranger's page to drive them from a victim's browser.
 */
function parseAllowedOrigins(): string[] | null {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw || raw === "*") return null;
  const list = raw
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter((entry) => entry.length > 0);
  return list.length > 0 ? list : null;
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

/** True for any `*.vercel.app` preview URL, so preview deploys are not locked out. */
function isVercelPreview(origin: string): boolean {
  if (process.env.ALLOW_VERCEL_PREVIEW_ORIGINS !== "true") return false;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function applyCorsHeaders(request: FastifyRequest, reply: FastifyReply): void {
  reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  reply.header("Access-Control-Max-Age", "86400");

  if (ALLOWED_ORIGINS === null) {
    reply.header("Access-Control-Allow-Origin", "*");
    return;
  }

  // With an allowlist the answer depends on the request, so caches must be told.
  reply.header("Vary", "Origin");

  const origin = request.headers.origin;
  if (typeof origin !== "string") return;

  const normalised = origin.replace(/\/$/, "");
  if (ALLOWED_ORIGINS.includes(normalised) || isVercelPreview(normalised)) {
    reply.header("Access-Control-Allow-Origin", origin);
  }
  // No match: the header is simply absent and the browser blocks the read.
  // We deliberately do not fail the request — server-to-server callers such as
  // the Razorpay webhook send no Origin at all and must keep working.
}

/**
 * Builds a configured, *not yet listening* Fastify instance.
 * The caller decides whether to `listen()` or hand it to a serverless handler.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  // ── Raw body capture for Razorpay webhook signature verification ───────────
  // The HMAC must be computed over the exact bytes Razorpay signed, so the raw
  // Buffer is stashed on the request before JSON.parse touches it.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req: FastifyRequest, body: Buffer, done) => {
      req.rawBodyBuffer = body;
      try {
        const parsed: unknown = JSON.parse(body.toString("utf8"));
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.addHook("onRequest", async (request, reply) => {
    applyCorsHeaders(request, reply);
  });
  app.options("*", async (_req, reply) => reply.code(200).send());

  // ── Health check ───────────────────────────────────────────────────────────
  // Kept at the root as well as under /api so uptime checks and the Vercel
  // dashboard can hit a stable path.
  const health = async () => ({ ok: true, service: "revenue-recovery-agent" });
  app.get("/health", health);
  app.get("/api/health", health);

  return app;
}

/**
 * Registers every route group. Called by both entry points.
 *
 * If you add a route file, add it here — not in `server.ts` and not in
 * `vercel.ts`. Anything registered anywhere else will work locally and 404 in
 * production, which is the exact failure this file exists to prevent.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await razorpayWebhookRoute(app);
  await recoveryRoutes(app);
  await dashboardRoutes(app);
  await demoRoutes(app);
  await settingsRoutes(app);
  await testAgentRoutes(app);
  await systemRoutes(app);
  await cronRoutes(app);
}

/** Convenience for callers that want a fully wired app in one step. */
export async function createApp(): Promise<FastifyInstance> {
  const app = buildApp();
  await registerRoutes(app);
  return app;
}

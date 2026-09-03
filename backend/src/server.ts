import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { razorpayWebhookRoute } from "./routes/razorpayWebhook.js";
import { recoveryRoutes } from "./routes/recovery.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { demoRoutes } from "./routes/demo.js";
import { settingsRoutes } from "./routes/settings.js";
import { startRetryScheduler } from "./services/retryScheduler.js";
import { config } from "./config.js";
import { logEvent } from "./utils/logger.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBodyBuffer?: Buffer;
  }
}

const app = Fastify({ logger: false });

// ── Raw body capture for Razorpay webhook signature verification ─────────────
// We store the raw Buffer on the request before JSON.parse so the HMAC check
// can compare against the original bytes Razorpay signed.
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

// ── CORS (dev: frontend may run on a different port) ─────────────────────────
app.addHook("onRequest", async (_request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
});
app.options("*", async (_req, reply) => reply.code(200).send());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", async () => ({ ok: true, service: "revenue-recovery-agent" }));

// ── Routes ────────────────────────────────────────────────────────────────────
await razorpayWebhookRoute(app);
await recoveryRoutes(app);
await dashboardRoutes(app);
await demoRoutes(app);
await settingsRoutes(app);

const address = await app.listen({ port: config.port, host: "0.0.0.0" });
logEvent("SERVER_STARTED", { address, port: config.port });

// Start retry scheduler after server is listening
startRetryScheduler();

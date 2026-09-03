/**
 * Vercel serverless entry point.
 *
 * Wraps the Fastify app as a Vercel serverless function.
 * Vercel calls the default export as a Node.js IncomingMessage handler.
 */

import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { razorpayWebhookRoute } from "./routes/razorpayWebhook.js";
import { recoveryRoutes } from "./routes/recovery.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { demoRoutes } from "./routes/demo.js";
import { settingsRoutes } from "./routes/settings.js";
import { logEvent } from "./utils/logger.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBodyBuffer?: Buffer;
  }
}

// Build the Fastify app once — Vercel reuses the same instance across warm invocations
const app = Fastify({ logger: false });

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

app.addHook("onRequest", async (_request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
});
app.options("*", async (_req, reply) => reply.code(200).send());
app.get("/health", async () => ({ ok: true, service: "revenue-recovery-agent" }));

await razorpayWebhookRoute(app);
await recoveryRoutes(app);
await dashboardRoutes(app);
await demoRoutes(app);
await settingsRoutes(app);

// Ready the Fastify instance without binding to a port
await app.ready();

// Vercel invokes this as a standard Node.js HTTP handler
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  app.server.emit("request", req, res);
}

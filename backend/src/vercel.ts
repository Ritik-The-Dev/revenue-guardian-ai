/**
 * Vercel serverless entry point.
 *
 * Vercel gives us a Node `IncomingMessage` / `ServerResponse` pair rather than
 * a listening socket, so the Fastify instance is built once per cold start and
 * requests are pushed into it directly. `app.ready()` must have resolved before
 * the first request is emitted, otherwise Fastify has not finished building its
 * router and the request 404s.
 *
 * Routes are *not* declared here — see `app.ts`. An earlier version of this file
 * kept its own registration list, fell behind `server.ts`, and shipped a build
 * where the entire Test Agent flow returned 404 in production.
 *
 * The retry scheduler is deliberately absent: a `setInterval` cannot outlive an
 * invocation. Vercel Cron calls `/api/cron/retry-tick` instead.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

import { createApp } from "./app.js";

/**
 * Built once per cold start and reused by every warm invocation. Holding the
 * promise (not the instance) means concurrent requests arriving during a cold
 * start all await the same initialisation instead of racing to build their own.
 */
let appPromise: Promise<FastifyInstance> | undefined;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const app = await createApp();
      await app.ready();
      return app;
    })().catch((err: unknown) => {
      // Do not cache a failed boot — the next invocation should try again.
      appPromise = undefined;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await getApp();
    app.server.emit("request", req, res);
  } catch (err) {
    // A boot failure is almost always a missing environment variable. Log the
    // detail for the platform log; return nothing revealing to the caller.
    console.error("[vercel] failed to initialise the API", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify({ error: "The recovery service is not available." }));
  }
}

/**
 * Local / long-running entry point.
 *
 * Owns exactly two things the serverless entry must not do: it binds a port,
 * and it starts the interval-based retry scheduler. Routes come from `app.ts`
 * so this file and `vercel.ts` can never disagree about what the API exposes.
 */

import { createApp } from "./app.js";
import { startRetryScheduler } from "./services/retryScheduler.js";
import { config } from "./config.js";
import { logEvent } from "./utils/logger.js";

const app = await createApp();

const address = await app.listen({ port: config.port, host: "0.0.0.0" });
logEvent("SERVER_STARTED", { address, port: config.port });

// Start retry scheduler after server is listening.
// On Vercel this is replaced by Vercel Cron calling /api/cron/retry-tick.
startRetryScheduler();

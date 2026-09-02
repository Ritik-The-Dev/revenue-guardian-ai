import Fastify from "fastify";
import rawBody from "@fastify/raw-body";
import { razorpayWebhookRoute } from "./routes/razorpayWebhook.js";
import { recoveryRoutes } from "./routes/recovery.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { demoRoutes } from "./routes/demo.js";
import { config } from "./config.js";

const app = Fastify({ logger: false });
await app.register(rawBody, { field: "rawBody", global: false, encoding: "utf8", runFirst: true });
await razorpayWebhookRoute(app);
await recoveryRoutes(app);
await dashboardRoutes(app);
await demoRoutes(app);
app.get("/health", async () => ({ ok: true, service: "revenue-recovery-agent" }));
await app.listen({ port: config.port, host: "0.0.0.0" });
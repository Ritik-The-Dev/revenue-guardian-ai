import { z } from "zod";

const numberFromEnv = (fallback: number) => z.coerce.number().default(fallback);

export const config = {
  port: Number(process.env.PORT ?? 3000),
  baseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
  pollinationsModel: process.env.POLLINATIONS_MODEL ?? "openai",
  limits: {
    maxRetryAttempts: numberFromEnv(2).parse(process.env.MAX_RETRY_ATTEMPTS),
    maxOutreachAttempts: numberFromEnv(2).parse(process.env.MAX_OUTREACH_ATTEMPTS),
    cooldownHours: numberFromEnv(24).parse(process.env.COOLDOWN_HOURS),
    minimumRecoveryValue: numberFromEnv(100).parse(process.env.MINIMUM_RECOVERY_VALUE),
    highValueThreshold: numberFromEnv(25000).parse(process.env.HIGH_VALUE_THRESHOLD),
    lowConfidenceThreshold: numberFromEnv(0.6).parse(process.env.LOW_CONFIDENCE_THRESHOLD),
  },
};
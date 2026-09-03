import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30000,
    hookTimeout: 15000,
    // Set env vars BEFORE any module is loaded — this is the only reliable way
    // to ensure config.ts reads them at startup.
    env: {
      NODE_ENV: "test",
      POLLINATIONS_API_KEY: "poll_test_key",
      POLLINATIONS_MODEL: "openai",
      RAZORPAY_KEY_ID: "rzp_test_key",
      RAZORPAY_KEY_SECRET: "rzp_test_secret",
      RAZORPAY_WEBHOOK_SECRET: "test_webhook_secret",
      WHATSAPP_ACCESS_TOKEN: "wa_test_token",
      WHATSAPP_PHONE_NUMBER_ID: "12345678",
      SMTP_HOST: "",
      MAX_RETRY_ATTEMPTS: "2",
      MAX_OUTREACH_ATTEMPTS: "2",
      MINIMUM_RECOVERY_VALUE: "100",
      HIGH_VALUE_THRESHOLD: "25000",
      LOW_CONFIDENCE_THRESHOLD: "0.6",
    },
  },
});

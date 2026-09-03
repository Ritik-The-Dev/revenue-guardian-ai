const SCRUB_KEYS = new Set([
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "POLLINATIONS_API_KEY",
  "OPENAI_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "SMTP_PASSWORD",
  "password",
  "secret",
  "token",
  "apiKey",
  "api_key",
]);

export function logEvent(event: string, metadata: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    safe[k] = SCRUB_KEYS.has(k) ? "[REDACTED]" : v;
  }
  console.log(JSON.stringify({ event, ...safe, at: new Date().toISOString() }));
}

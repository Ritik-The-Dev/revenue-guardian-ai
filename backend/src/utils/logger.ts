export function logEvent(event: string, metadata: Record<string, unknown> = {}) {
  const safe = { ...metadata };
  for (const key of ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "OPENAI_API_KEY", "WHATSAPP_ACCESS_TOKEN", "SMTP_PASSWORD"]) {
    delete safe[key];
  }
  console.log(JSON.stringify({ event, ...safe, at: new Date().toISOString() }));
}
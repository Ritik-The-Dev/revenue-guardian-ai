import { config } from "../config.js";

export async function createPaymentLink(input: {
  amount: number;
  currency: string;
  referenceId: string;
  description: string;
}): Promise<{ shortUrl: string; linkId: string } | null> {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) return null;

  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(input.amount * 100),
      currency: input.currency,
      reference_id: input.referenceId,
      description: input.description,
      callback_method: "get",
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({})) as {
      error?: { code?: string; description?: string; reason?: string };
    };
    const errCode = errBody?.error?.code ?? "UNKNOWN";
    const errDesc = errBody?.error?.description ?? `HTTP ${response.status}`;
    throw new Error(`Razorpay payment link failed: ${response.status} [${errCode}] ${errDesc}`);
  }

  const json = await response.json() as { id?: string; short_url?: string };
  if (!json.short_url || !json.id) return null;
  return { shortUrl: json.short_url, linkId: json.id };
}

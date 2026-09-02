import { config } from "../config.js";

export async function createPaymentLink(input: { amount: number; currency: string; referenceId: string; description: string }) {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) return null;
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/payment_links", { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: Math.round(input.amount * 100), currency: input.currency, reference_id: input.referenceId, description: input.description, callback_method: "get" }) });
  if (!response.ok) throw new Error(`Razorpay payment link failed: ${response.status}`);
  const json = await response.json() as { short_url?: string };
  return json.short_url ?? null;
}
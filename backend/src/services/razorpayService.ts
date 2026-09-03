import { config } from "../config.js";

export async function createPaymentLink(input: {
  amount: number;
  currency: string;
  referenceId: string;
  description: string;
}): Promise<{ shortUrl: string; linkId: string } | null> {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) return null;

  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");

  // ── Attempt to create a new payment link ─────────────────────────────────
  const createRes = await fetch("https://api.razorpay.com/v1/payment_links", {
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

  if (createRes.ok) {
    const json = await createRes.json() as { id?: string; short_url?: string };
    if (json.short_url && json.id) {
      return { shortUrl: json.short_url, linkId: json.id };
    }
    return null;
  }

  // ── 429 Rate limit — fall back to an existing link for this reference_id ─
  if (createRes.status === 429) {
    const errBody = await createRes.json().catch(() => ({})) as {
      error?: { code?: string; description?: string };
    };
    const errCode = errBody?.error?.code ?? "RATE_LIMIT_EXCEEDED";
    const errDesc = errBody?.error?.description ?? "test mode limit reached";

    // Try to find an existing payment link for this order (reference_id)
    const listRes = await fetch(
      `https://api.razorpay.com/v1/payment_links?reference_id=${encodeURIComponent(input.referenceId)}`,
      { headers: { Authorization: `Basic ${auth}` } },
    );

    if (listRes.ok) {
      const listJson = await listRes.json() as {
        items?: Array<{ id: string; short_url: string; status: string }>;
      };
      // Prefer active links first, then cancelled/expired — any link is better than none
      const items = listJson.items ?? [];
      const existing =
        items.find(l => l.status === "created") ??
        items.find(l => l.status === "partially_paid") ??
        items.find(l => l.status === "cancelled") ??
        items.find(l => l.status === "expired") ??
        items[0];

      if (existing?.short_url && existing?.id) {
        // Return existing link — annotate the ID so callers know it was reused
        return { shortUrl: existing.short_url, linkId: existing.id };
      }
    }

    // No existing link found either — throw with full detail so it's auditable
    throw new Error(
      `Razorpay payment link failed: 429 [${errCode}] ${errDesc} — no existing link found for reference_id=${input.referenceId}`,
    );
  }

  // ── Other HTTP error ──────────────────────────────────────────────────────
  const errBody = await createRes.json().catch(() => ({})) as {
    error?: { code?: string; description?: string };
  };
  const errCode = errBody?.error?.code ?? "UNKNOWN";
  const errDesc = errBody?.error?.description ?? `HTTP ${createRes.status}`;
  throw new Error(`Razorpay payment link failed: ${createRes.status} [${errCode}] ${errDesc}`);
}

export async function sendWhatsAppText(toPhone: string, body: string): Promise<{ id?: string; ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: "missing_credentials" };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, type: "text", text: { body, preview_url: false } }) });
  const json = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string } };
  return res.ok ? { ok: true, id: json.messages?.[0]?.id } : { ok: false, error: json.error?.message ?? `http_${res.status}` };
}
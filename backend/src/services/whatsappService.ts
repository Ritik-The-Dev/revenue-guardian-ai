/**
 * WhatsApp sender.
 *
 * Primary:  interntech.xyz API  (WHATSAPP_SEND_API_KEY)
 * Fallback: Meta Cloud API      (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID)
 *
 * Returns { ok, id?, error? } — callers do not need to know which provider sent.
 */

export async function sendWhatsAppText(
  toPhone: string,
  body: string,
): Promise<{ id?: string; ok: boolean; error?: string }> {
  const sendApiKey = process.env.WHATSAPP_SEND_API_KEY;

  // ── Primary: interntech.xyz ───────────────────────────────────────────────
  if (sendApiKey) {
    try {
      const res = await fetch("https://interntech.xyz/api/whatsapp/send", {
        method: "POST",
        headers: {
          "x-api-key": sendApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to: toPhone, message: body }),
      });

      const json = await res.json().catch(() => ({})) as {
        ok?: boolean;
        id?: string;
        error?: string;
        message?: string;
      };

      if (res.ok && json.ok) {
        return { ok: true, id: json.id };
      }

      // Non-ok response — fall through to Meta fallback
      const errMsg = json.error ?? json.message ?? `http_${res.status}`;
      // Only fall through; don't throw — we want to try Meta next
      return await sendViaMetaApi(toPhone, body, `interntech failed (${errMsg})`);
    } catch (err) {
      // Network error on primary — fall through to Meta
      return await sendViaMetaApi(toPhone, body, `interntech exception: ${String(err)}`);
    }
  }

  // ── No primary key — use Meta directly ───────────────────────────────────
  return await sendViaMetaApi(toPhone, body);
}

async function sendViaMetaApi(
  toPhone: string,
  body: string,
  primaryError?: string,
): Promise<{ id?: string; ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    return {
      ok: false,
      error: primaryError
        ? `${primaryError}; Meta fallback: missing_credentials`
        : "missing_credentials",
    };
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body, preview_url: false },
      }),
    },
  );

  const json = await res.json().catch(() => ({})) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };

  if (res.ok) {
    return { ok: true, id: json.messages?.[0]?.id };
  }

  const metaErr = json.error?.message ?? `http_${res.status}`;
  return {
    ok: false,
    error: primaryError ? `${primaryError}; Meta: ${metaErr}` : metaErr,
  };
}

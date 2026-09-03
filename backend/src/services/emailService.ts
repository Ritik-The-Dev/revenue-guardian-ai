import nodemailer from "nodemailer";

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const host = process.env.SMTP_HOST;
  if (!host) return { ok: false, error: "missing_credentials" };

  const port = Number(process.env.SMTP_PORT ?? 587);
  // Port 465 = implicit SSL (secure: true)
  // Port 587 = STARTTLS (secure: false, requireTLS: true)
  // Never mix: setting secure: true on port 587 causes "wrong version number"
  const secure = port === 465;

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure, // force STARTTLS upgrade on port 587
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
      tls: {
        // Allow self-signed certs in dev; remove in production
        rejectUnauthorized: false,
      },
    });

    const info = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    return { ok: true, messageId: info.messageId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "smtp_failed" };
  }
}

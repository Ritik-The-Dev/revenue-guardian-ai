import nodemailer from "nodemailer";

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const host = process.env.SMTP_HOST;
  if (!host) return { ok: false, error: "missing_credentials" };
  try {
    const transport = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_USE_TLS === "true", auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD } });
    const info = await transport.sendMail({ from: process.env.SMTP_FROM, to: input.to, subject: input.subject, text: input.text, html: input.html });
    return { ok: true, messageId: info.messageId };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "smtp_failed" }; }
}
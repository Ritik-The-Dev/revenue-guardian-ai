import { prisma } from "../db/prisma.js";
import { sendEmail } from "./emailService.js";
import { sendWhatsAppText } from "./whatsappService.js";
import { audit } from "./auditService.js";

export async function routeNotification(caseId: string, channel: string | null, message: string, paymentLink: string | null) {
  const item = await prisma.recoveryCase.findUnique({ where: { id: caseId }, include: { customer: true, payment: true } });
  if (!item || !item.customer || item.customer.communicationPreference === "NONE") return { ok: false, reason: "no_channel" };
  const body = `${message}\n\nPayment amount: ${item.payment.currency} ${item.payment.amount}${paymentLink ? `\nComplete securely: ${paymentLink}` : ""}`;
  if (channel === "WHATSAPP" && item.customer.phone) {
    const result = await sendWhatsAppText(item.customer.phone, body);
    await prisma.recoveryAction.upsert({ where: { caseId_action: { caseId, action: "SEND_PAYMENT_LINK" } }, update: { status: result.ok ? "SENT" : "FAILED", providerMessageId: result.id, error: result.error, executedAt: new Date() }, create: { caseId, action: "SEND_PAYMENT_LINK", channel, status: result.ok ? "SENT" : "FAILED", providerMessageId: result.id, error: result.error, executedAt: new Date() } });
    await audit(caseId, result.ok ? "WHATSAPP_SENT" : "ACTION_FAILED", result.ok ? "WhatsApp notification sent" : "WhatsApp delivery failed", { error: result.error });
    if (result.ok || !item.customer.email) return result;
  }
  if ((channel === "EMAIL" || item.customer.email) && item.customer.email) {
    const result = await sendEmail({ to: item.customer.email, subject: "Your payment needs attention", text: body });
    await prisma.recoveryAction.upsert({ where: { caseId_action: { caseId, action: "SEND_REMINDER" } }, update: { status: result.ok ? "SENT" : "FAILED", error: result.error, executedAt: new Date() }, create: { caseId, action: "SEND_REMINDER", channel: "EMAIL", status: result.ok ? "SENT" : "FAILED", error: result.error, executedAt: new Date() } });
    await audit(caseId, result.ok ? "EMAIL_SENT" : "ACTION_FAILED", result.ok ? "Email sent" : "Email delivery failed", { error: result.error });
    return result;
  }
  return { ok: false, reason: "no_channel" };
}
import { prisma } from "../db/prisma.js";
import { audit } from "./auditService.js";

export async function markPaymentRecovered(paymentId: string, amount?: number) {
  const payment = await prisma.payment.update({ where: { razorpayPaymentId: paymentId }, data: { status: "captured" } });
  const cases = await prisma.recoveryCase.findMany({ where: { paymentId: payment.id, status: { not: "RECOVERED" } } });
  for (const item of cases) {
    await prisma.recoveryCase.update({ where: { id: item.id }, data: { status: "RECOVERED", recoveredAmount: amount ?? Number(payment.amount), stopReason: null } });
    await prisma.recoveryAction.updateMany({ where: { caseId: item.id, status: { in: ["PENDING", "EXECUTING"] } }, data: { status: "CANCELLED", error: "Cancelled after payment capture" } });
    await audit(item.id, "PAYMENT_CAPTURED", "Razorpay confirmed payment capture", { amount: amount ?? Number(payment.amount) });
    await audit(item.id, "RECOVERY_COMPLETED", "Recovery case marked recovered", {});
  }
  return payment;
}
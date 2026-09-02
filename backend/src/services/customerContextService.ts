import { prisma } from "../db/prisma.js";

export async function buildCustomerContext(caseId: string) {
  const item = await prisma.recoveryCase.findUnique({ where: { id: caseId }, include: { payment: true, customer: true, order: true, actions: true } });
  if (!item) throw new Error("Recovery case not found");
  const previous = item.customer ? await prisma.recoveryCase.count({ where: { customerId: item.customer.id, id: { not: caseId } } }) : 0;
  return { customer: item.customer, payment: item.payment, order: item.order, recoveryHistory: { previousInterventions: previous, previousRecoveries: item.customer ? await prisma.recoveryCase.count({ where: { customerId: item.customer.id, status: "RECOVERED" } }) : 0, previousFailures: previous } };
}
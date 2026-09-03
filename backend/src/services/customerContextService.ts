import { prisma } from "../db/prisma.js";

export async function buildCustomerContext(caseId: string) {
  const item = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      payment: true,
      customer: true,
      order: true,
      actions: true,
    },
  });

  if (!item) throw new Error("Recovery case not found");

  const customerId = item.customer?.id;

  const [previousInterventions, previousRecoveries, previousFailures] = customerId
    ? await Promise.all([
        // Total prior cases (not counting this one)
        prisma.recoveryCase.count({
          where: { customerId, id: { not: caseId } },
        }),
        // Cases that were successfully recovered
        prisma.recoveryCase.count({
          where: { customerId, status: "RECOVERED", id: { not: caseId } },
        }),
        // Cases that were stopped without recovery (i.e., truly failed recoveries)
        prisma.recoveryCase.count({
          where: { customerId, status: "STOPPED", id: { not: caseId } },
        }),
      ])
    : [0, 0, 0];

  return {
    customer: item.customer,
    payment: item.payment,
    order: item.order,
    recoveryHistory: {
      previousInterventions,
      previousRecoveries,
      previousFailures,
    },
  };
}

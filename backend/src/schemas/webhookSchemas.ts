import { z } from "zod";

export const webhookEnvelopeSchema = z.object({
  id: z.string().optional(),
  event: z.enum([
    "payment.failed",
    "payment.captured",
    "order.paid",
    "invoice.paid",
    "invoice.partially_paid",
    "invoice.expired",
    "payment_link.paid",
    "payment_link.partially_paid",
    "payment_link.expired",
    "payment_link.cancelled",
  ]),
  payload: z.record(z.unknown()),
});

export type RazorpayWebhook = z.infer<typeof webhookEnvelopeSchema>;
export type RazorpayEventType = RazorpayWebhook["event"];

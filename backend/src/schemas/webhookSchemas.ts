import { z } from "zod";

export const webhookEnvelopeSchema = z.object({
  id: z.string().optional(),
  event: z.enum(["payment.failed", "payment.captured", "order.paid"]),
  payload: z.record(z.unknown()),
});

export type RazorpayWebhook = z.infer<typeof webhookEnvelopeSchema>;
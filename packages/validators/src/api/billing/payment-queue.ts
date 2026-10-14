import { z } from 'zod';

// POST /operator/payment-queue/:id/reject (D2-1/ADM-06).
export const rejectPaymentSchema = z.object({
  note: z.string().trim().min(1, 'A note is required.'),
});
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

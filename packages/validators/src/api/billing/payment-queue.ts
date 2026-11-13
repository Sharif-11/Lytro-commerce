import { z } from 'zod';
import { PAYMENT_NOTE_MAX_LENGTH } from '../../common/limits';
import { textField } from '../../common/text';
import { PlanPaymentKind } from '../../db/enums';

// GET /operator/payment-queue (D2-1/ADM-06): optionally only one kind of payment.
export const listPaymentQueueSchema = z.object({
  kind: z.nativeEnum(PlanPaymentKind).optional(),
});
export type ListPaymentQueueInput = z.infer<typeof listPaymentQueueSchema>;

// POST /operator/payment-queue/:id/reject (D2-1/ADM-06).
export const rejectPaymentSchema = z.object({
  note: textField(PAYMENT_NOTE_MAX_LENGTH),
});
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

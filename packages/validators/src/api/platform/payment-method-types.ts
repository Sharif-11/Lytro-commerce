import { z } from 'zod';
import { courierReasonSchema } from '../couriers/courier';

/**
 * POST operator/payment-method-types/:method/retire, /undo-retire and /remove (WAL-18, Slice 8.7, D8-65 to D8-67): why, for the
 * platform audit log only. A type follows the couriers' retire-then-remove lifecycle (WAL-18), so it takes the same reason;
 * shops are told in Lytro's own words.
 */
export const paymentMethodTypeReasonSchema = z
  .object({ reason: courierReasonSchema.shape.reason })
  .strict();
export type PaymentMethodTypeReasonInput = z.infer<typeof paymentMethodTypeReasonSchema>;

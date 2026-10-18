import { z } from 'zod';
import { PLAN_PAYMENT_METHODS } from '../../db/enums';

// POST /billing/quote (BIL-01): the plan and billing term the tenant wants to price.
export const quotePurchaseSchema = z.object({
  planId: z.string().uuid(),
  billingTermId: z.string().uuid(),
});
export type QuotePurchaseInput = z.infer<typeof quotePurchaseSchema>;

// POST /billing/purchase (BIL-02/08/16): either pay from balance (atomic, instant) or submit a wallet
// transaction ID for the operator's queue (D2-1) -- never both, and never silent. A plain object (not a
// discriminated union) so nestjs-zod's createZodDto, which needs one statically-known member shape, can
// still generate a DTO class from it; the wallet fields' presence is enforced by the refine below instead.
export const confirmPurchaseSchema = z
  .object({
    paymentId: z.string().uuid(),
    method: z.enum(PLAN_PAYMENT_METHODS),
    transactionId: z.string().trim().min(1).optional(),
    senderNumber: z.string().trim().min(1).optional(),
    amountPaid: z.coerce.number().positive().optional(),
  })
  .refine(
    (value) =>
      value.method === 'balance' ||
      (value.transactionId !== undefined &&
        value.senderNumber !== undefined &&
        value.amountPaid !== undefined),
    { message: 'transactionId, senderNumber and amountPaid are required for a wallet payment.' },
  );
export type ConfirmPurchaseInput = z.infer<typeof confirmPurchaseSchema>;

// POST /billing/auto-renew (BIL-17): the owner's own "renew automatically from balance" toggle.
export const setAutoRenewSchema = z.object({
  enabled: z.boolean(),
});
export type SetAutoRenewInput = z.infer<typeof setAutoRenewSchema>;

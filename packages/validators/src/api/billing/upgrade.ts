import { z } from 'zod';
import { PLAN_PAYMENT_METHODS } from '../../db/enums';
import { requireWalletFields } from './purchase';

// POST /billing/upgrade/quote (UPG-01/02): the higher-ranked plan and term the tenant wants to price.
export const quoteUpgradeSchema = z.object({
  planId: z.string().uuid(),
  billingTermId: z.string().uuid(),
});
export type QuoteUpgradeInput = z.infer<typeof quoteUpgradeSchema>;

// POST /billing/upgrade/confirm (UPG-16): the same two payment methods a purchase has -- pay from balance
// (atomic, instant) or submit a wallet transaction ID for the operator's queue (D2-1). Same shape as
// confirmPurchaseSchema, kept as its own schema since an upgrade confirm never carries a planId/billingTermId.
export const confirmUpgradeSchema = z
  .object({
    paymentId: z.string().uuid(),
    method: z.enum(PLAN_PAYMENT_METHODS),
    transactionId: z.string().trim().min(1).optional(),
    senderNumber: z.string().trim().min(1).optional(),
    amountPaid: z.coerce.number().positive().optional(),
  })
  .superRefine(requireWalletFields);
export type ConfirmUpgradeInput = z.infer<typeof confirmUpgradeSchema>;

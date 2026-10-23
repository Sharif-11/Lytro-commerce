import { z } from 'zod';
import { PLAN_PAYMENT_METHODS, type PlanPaymentMethod } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';

const WALLET_FIELDS = ['transactionId', 'senderNumber', 'amountPaid'] as const;

/**
 * BIL-02: a wallet payment names its transaction ID, the number it was sent from and the amount sent. Each one
 * missing is reported on its own field (API-16), so the form can point at exactly what to fill in.
 */
export function requireWalletFields(
  value: { method: PlanPaymentMethod } & Partial<Record<(typeof WALLET_FIELDS)[number], unknown>>,
  ctx: z.RefinementCtx,
): void {
  if (value.method === 'balance') return;
  for (const field of WALLET_FIELDS) {
    if (value[field] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        params: { problem: FieldProblemCode.Required },
        message: `${field} is required for a wallet payment.`,
      });
    }
  }
}

// POST /billing/quote (BIL-01): the plan and billing term the tenant wants to pay for, made when the seller commits.
export const quotePurchaseSchema = z.object({
  planId: z.string().uuid(),
  billingTermId: z.string().uuid(),
  // BIL-09, UPG-07: the amount the seller was shown. The server works the amount out again and refuses the quote
  // (AmountChanged, with the new amount) when it differs, so nothing is ever charged that was not shown.
  amount: z.coerce.number().positive().optional(),
});
export type QuotePurchaseInput = z.infer<typeof quotePurchaseSchema>;

// POST /billing/purchase (BIL-02/08/16): either pay from balance (atomic, instant) or submit a wallet
// transaction ID for the operator's queue (D2-1) -- never both, and never silent. A plain object (not a
// discriminated union) so nestjs-zod's createZodDto, which needs one statically-known member shape, can
// still generate a DTO class from it; the wallet fields' presence is enforced by requireWalletFields instead.
export const confirmPurchaseSchema = z
  .object({
    paymentId: z.string().uuid(),
    method: z.enum(PLAN_PAYMENT_METHODS),
    transactionId: z.string().trim().min(1).optional(),
    senderNumber: z.string().trim().min(1).optional(),
    amountPaid: z.coerce.number().positive().optional(),
  })
  .superRefine(requireWalletFields);
export type ConfirmPurchaseInput = z.infer<typeof confirmPurchaseSchema>;

// POST /billing/auto-renew (BIL-17): the owner's own "renew automatically from balance" toggle.
export const setAutoRenewSchema = z.object({
  enabled: z.boolean(),
});
export type SetAutoRenewInput = z.infer<typeof setAutoRenewSchema>;

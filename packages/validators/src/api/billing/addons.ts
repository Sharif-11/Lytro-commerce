import { z } from 'zod';
import { transactionIdField } from '../../common/transaction-id';
import { ADDON_QUANTITY_MAX, AddonKind, PLAN_PAYMENT_METHODS } from '../../db/enums';
import { planLimitsSchema } from '../../db/plans/plan-limits';
import { requireWalletFields } from './purchase';

// PLN-13: the limit a limit add-on raises (and, from Slice 10a.3, a pack tops up): any usage limit of 2.1.
const limitKeys = Object.keys(planLimitsSchema.shape).filter(
  (key) => key !== 'activity_retention_days',
) as [string, ...string[]];

// POST /operator/addons (PLN-13): one item of the catalogue. A limit add-on and a pack name the limit they raise and
// how much one unit adds, in that limit's own unit; a feature add-on names neither. Prices are whole taka: a month
// of a limit or feature add-on, or one pack.
export const createAddonSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,49}$/),
    kind: z.nativeEnum(AddonKind),
    limitKey: z.enum(limitKeys).nullable().default(null),
    unitSize: z.number().int().positive().nullable().default(null),
    price: z.coerce.number().int().positive(),
    labelEn: z.string().trim().min(1).max(100),
    labelBn: z.string().trim().min(1).max(100),
  })
  .superRefine((value, ctx) => {
    const raises = value.kind === AddonKind.Limit || value.kind === AddonKind.Pack;
    for (const field of ['limitKey', 'unitSize'] as const) {
      if (raises === (value[field] === null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: raises
            ? `A ${value.kind} add-on names the ${field} it adds.`
            : `A ${value.kind} add-on has no ${field}.`,
        });
      }
    }
  });
export type CreateAddonInput = z.infer<typeof createAddonSchema>;

// PATCH /operator/addons/:id: the price and names; a new price applies to the next purchase only.
export const updateAddonSchema = z.object({
  price: z.coerce.number().int().positive().optional(),
  unitSize: z.number().int().positive().optional(),
  labelEn: z.string().trim().min(1).max(100).optional(),
  labelBn: z.string().trim().min(1).max(100).optional(),
});
export type UpdateAddonInput = z.infer<typeof updateAddonSchema>;

// POST /addons/quote (PLN-14): how many of one add-on, priced for the rest of the period.
export const quoteAddonSchema = z.object({
  addonId: z.string().uuid(),
  quantity: z.number().int().min(1).max(ADDON_QUANTITY_MAX).default(1),
  // BIL-09, UPG-07: the amount the seller was shown. The server works the amount out again and refuses the quote
  // (AmountChanged, with the new amount) when it differs, so nothing is ever charged that was not shown.
  amount: z.coerce.number().positive().optional(),
  // PLN-14 (Slice 11.5c): whether it renews -- the Buy sheet's switch, set with the request rather than after it.
  renews: z.boolean().default(true),
});
export type QuoteAddonInput = z.infer<typeof quoteAddonSchema>;

// POST /addons/purchase (PLN-14, BIL-02, BIL-08): pays a quoted add-on from the balance, or submits a wallet payment
// for the operator's queue -- the same shape as a plan purchase. The balance when no method is named.
export const confirmAddonSchema = z
  .object({
    paymentId: z.string().uuid(),
    method: z.enum(PLAN_PAYMENT_METHODS).default('balance'),
    transactionId: transactionIdField.optional(),
    senderNumber: z.string().trim().min(1).optional(),
    amountPaid: z.coerce.number().positive().optional(),
  })
  .superRefine(requireWalletFields);
export type ConfirmAddonInput = z.infer<typeof confirmAddonSchema>;

// POST /addons/packs (PLN-15, BND-04, RTE-11): buys packs from the balance at once -- a pack's price is fixed, so there
// is no quote to hold.
export const buyPacksSchema = z.object({
  addonId: z.string().uuid(),
  quantity: z.number().int().min(1).max(ADDON_QUANTITY_MAX).default(1),
  // BIL-09 (Slice 11.5c): the amount the seller was shown, refused (AmountChanged) when the price has changed since.
  amount: z.coerce.number().positive().optional(),
});
export type BuyPacksInput = z.infer<typeof buyPacksSchema>;

// PATCH /addons/auto-buy (PLN-15): the two auto-buy switches, either or both.
export const setPackAutoBuySchema = z
  .object({
    bandwidth: z.boolean().optional(),
    requests: z.boolean().optional(),
  })
  .refine((value) => value.bandwidth !== undefined || value.requests !== undefined, {
    message: 'Name bandwidth, requests or both.',
    path: ['bandwidth'],
  });
export type SetPackAutoBuyInput = z.infer<typeof setPackAutoBuySchema>;

// PATCH /addons/mine/:id (PLN-14): whether the add-on renews with the plan.
export const setAddonRenewalSchema = z.object({
  renews: z.boolean(),
});
export type SetAddonRenewalInput = z.infer<typeof setAddonRenewalSchema>;

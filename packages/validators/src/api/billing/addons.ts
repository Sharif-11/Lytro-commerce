import { z } from 'zod';
import { ADDON_QUANTITY_MAX, AddonKind } from '../../db/enums';
import { planLimitsSchema } from '../../db/plans/plan-limits';

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
});
export type QuoteAddonInput = z.infer<typeof quoteAddonSchema>;

// POST /addons/purchase (PLN-14, BIL-08): pays a quoted add-on from the balance. Paying by wallet follows in 10a.2.
export const confirmAddonSchema = z.object({
  paymentId: z.string().uuid(),
});
export type ConfirmAddonInput = z.infer<typeof confirmAddonSchema>;

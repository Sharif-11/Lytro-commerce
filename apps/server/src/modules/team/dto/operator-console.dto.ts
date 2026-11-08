import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { TenantState } from '@lytronix/validators';
import { shopAddonsSchema } from './addons-response.dto';

// OPERATOR-CONSOLE-DESIGN §15: what the console's screens read that the older operator routes do not carry.
export const operatorShopSchema = z.object({
  id: z.string(),
  slug: z.string(),
  shopName: z.string(),
  state: z.nativeEnum(TenantState),
  createdAt: z.date(),
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  planVersion: z.number().nullable(),
  periodStart: z.date().nullable(),
  periodEnd: z.date().nullable(),
  overrideCount: z.number(),
  suspension: z
    .object({ at: z.date(), reason: z.string().nullable(), by: z.string().nullable() })
    .nullable(),
  paymentPageSuspension: z.object({ at: z.date(), reason: z.string().nullable() }).nullable(),
  newShopCap: z.object({ set: z.boolean().nullable(), holds: z.boolean() }),
});
export class OperatorShopDto extends createZodDto(operatorShopSchema) {}

// The console's view of a shop's add-ons doesn't count an allowance's uses (Slice 7.7's usesLeft is the shop's own).
const operatorShopAddonSchema = shopAddonsSchema.shape.addons.element
  .omit({ usesLeft: true })
  .extend({
    monthlyPrice: z.string(),
    paidFrom: z.enum(['balance', 'wallet']),
  });

export const operatorShopAddonsSchema = z.object({
  addons: operatorShopAddonSchema.array(),
  packs: shopAddonsSchema.shape.packs,
  limits: z
    .object({
      key: z.string(),
      plan: z.unknown(),
      overridden: z.boolean(),
      override: z.unknown(),
      addons: z.number(),
      effective: z.unknown(),
    })
    .array(),
});
export class OperatorShopAddonsDto extends createZodDto(operatorShopAddonsSchema) {}

export const recentChangeSchema = z.object({
  id: z.number(),
  action: z.string(),
  at: z.date(),
  by: z.string().nullable(),
  key: z.string().nullable(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string().nullable(),
  rateChangeId: z.number().int().nullable(),
  shop: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable(),
});
export class RecentChangeListDto extends createZodDto(recentChangeSchema.array()) {}

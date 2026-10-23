import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// BAL-03, BIL-04: submitted payments the operator is still checking.
const beingCheckedSchema = z.object({ count: z.number(), amount: z.string() });

// TENANT-DASHBOARD-DESIGN §7.1: each part is null when the caller may not see it (STF-11).
export const homeViewSchema = z.object({
  products: z.object({ total: z.number(), active: z.number() }).nullable(),
  stock: z.object({ low: z.number(), out: z.number(), expiringBatches: z.number() }).nullable(),
  balance: z
    .object({
      amount: z.string(),
      low: z.boolean(),
      freeSms: z.object({ used: z.number(), limit: z.number().nullable() }),
    })
    .nullable(),
  topUpsBeingChecked: beingCheckedSchema.nullable(),
  paymentsBeingChecked: beingCheckedSchema.nullable(),
  staffWithoutPassword: z.number().nullable(),
  fastSpendAlertedAt: z.date().nullable(),
  // SUP-01: the owner's set-up checklist, as far as the server can tell it.
  checklist: z
    .object({
      deliveryCharges: z.object({
        area: z.object({ en: z.string(), bn: z.string() }),
        inside: z.string(),
        outside: z.string(),
      }),
      firstProduct: z.boolean(),
      logo: z.boolean(),
      linkShared: z.boolean(),
      apiKey: z.boolean(),
    })
    .nullable(),
});
export class HomeViewDto extends createZodDto(homeViewSchema) {}

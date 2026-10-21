import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { UsageMetric } from '@lytronix/validators';

const suggestionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('plan'),
    planId: z.string(),
    name: z.string(),
    price: z.number(),
    months: z.number(),
    monthly: z.number(),
  }),
  z.object({ kind: z.literal('contact') }),
]);

// LIM-01, LIM-02: the usage page's answer. A null limit is unlimited (PLN-19); `level` is the highest share reached, or
// `stopped` past the grace; `suggestions` are what would give room once any metric is near its limit.
export const shopUsageSchema = z.object({
  cycleStart: z.date(),
  cycleEnd: z.date(),
  metrics: z.array(
    z.object({
      metric: z.nativeEnum(UsageMetric),
      used: z.number(),
      limit: z.number().nullable(),
      unit: z.enum(['count', 'bytes']),
      perCycle: z.boolean(),
      level: z
        .union([z.literal(50), z.literal(80), z.literal(95), z.literal(100), z.literal('stopped')])
        .nullable(),
    }),
  ),
  bandwidthDays: z.array(z.object({ day: z.string(), bytes: z.number(), requests: z.number() })),
  suggestions: z
    .object({ first: suggestionSchema, alternative: suggestionSchema.nullable() })
    .nullable(),
  fastSpendAlertedAt: z.date().nullable(),
});
export class ShopUsageDto extends createZodDto(shopUsageSchema) {}

import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { UsageMetric } from '@lytronix/validators';

// LIM-02: the usage page's answer. A null limit is unlimited (PLN-19).
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
    }),
  ),
  bandwidthDays: z.array(z.object({ day: z.string(), bytes: z.number(), requests: z.number() })),
});
export class ShopUsageDto extends createZodDto(shopUsageSchema) {}

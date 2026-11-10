import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { cloudflarePricesSchema, mediaCostsQuerySchema } from '@lytronix/validators';

// MED-12, D8-57 to D8-64 (Phase 8 Slice 8.6): the operator's media costs page, as the console reads it. Money is US
// dollars to two places.

export class MediaCostsQueryDto extends createZodDto(mediaCostsQuerySchema) {}

const dollars = z.string();

const costLineSchema = z.object({
  operations: z.number().int(),
  billableMillions: z.number().int(),
  cost: dollars,
});

export const mediaCostsViewSchema = z.object({
  period: z.object({
    dateFrom: z.string(),
    dateTo: z.string(),
    days: z.number().int(),
    daysRecorded: z.number().int(),
  }),
  connected: z.boolean(),
  readAt: z.string().nullable(),
  budget: z.object({
    amount: dollars,
    alertPercent: z.number().int(),
    alertAt: dollars,
    usedPercent: z.number().int(),
    alertEmail: z.string().nullable(),
    alertSentAt: z.string().nullable(),
  }),
  r2: z.object({
    classA: costLineSchema,
    classB: costLineSchema,
    storage: z.object({
      gbMonths: z.number(),
      billableGbMonths: z.number().int(),
      cost: dollars,
    }),
    cost: dollars,
    buckets: z.array(
      z.object({
        bucket: z.string(),
        classA: z.number().int(),
        classB: z.number().int(),
        freeOps: z.number().int(),
        gbMonths: z.number(),
        latestBytes: z.number().int(),
        objects: z.number().int(),
      }),
    ),
  }),
  workers: z.object({
    requests: z.number().int(),
    bytes: z.number().int(),
    billableMillions: z.number().int(),
    monthly: dollars,
    cost: dollars,
  }),
  total: dollars,
  topShops: z.array(
    z.object({
      tenantId: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      requests: z.number().int(),
      bytes: z.number().int(),
    }),
  ),
  periods: z.array(z.object({ dateFrom: z.string(), dateTo: z.string() })),
  prices: cloudflarePricesSchema,
});
export class MediaCostsViewDto extends createZodDto(mediaCostsViewSchema) {}

import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  FraudCheckTrigger,
  FraudSource,
  FraudSourceState,
  fraudCheckQuerySchema,
  runFraudCheckSchema,
  updateFraudRuleSchema,
} from '@lytronix/validators';

export class RunFraudCheckDto extends createZodDto(runFraudCheckSchema) {}
export class FraudCheckQueryDto extends createZodDto(fraudCheckQuerySchema) {}
export class UpdateFraudRuleDto extends createZodDto(updateFraudRuleSchema) {}

// FRD-01 as amended (D7-48, D7-52): Steadfast's record of the phone, as it gives it -- whole percentages, the size of its
// record and merchants' reports; null percentages for a phone it has no record of.
const courierFiguresSchema = z.object({
  deliveredPercent: z.number().int().nullable(),
  cancelledPercent: z.number().int().nullable(),
  returnedPercent: z.number().int().nullable(),
  volumeBand: z.string().nullable(),
  volumeRange: z.string().nullable(),
  reports: z.number().int(),
  doubtful: z.boolean(),
  categories: z.array(z.string()),
});

// FRD-01, FRD-02, FRD-03, FRD-11: one check of a phone: its sources and what each did, the figures, and the cost.
const fraudCheckSchema = z.object({
  id: z.string().uuid(),
  phone: z.string(),
  checkedAt: z.string(),
  trigger: z.nativeEnum(FraudCheckTrigger),
  orderId: z.string().uuid().nullable(),
  sources: z.array(
    z.object({
      source: z.nativeEnum(FraudSource),
      state: z.nativeEnum(FraudSourceState),
      // FRD-03: a courier answer reused within three days (FRD-04).
      cached: z.boolean(),
    }),
  ),
  steadfast: courierFiguresSchema.nullable(),
  // D7-49: the shop's own finished orders with the phone.
  ownOrders: z.object({
    delivered: z.number().int(),
    returned: z.number().int(),
    cancelled: z.number().int(),
  }),
  cost: z.string(),
});

export class FraudCheckDto extends createZodDto(fraudCheckSchema) {}
// FRD-01: the latest check of a phone, or null when it has never been checked.
export class LatestFraudCheckDto extends createZodDto(
  z.object({ latest: fraudCheckSchema.nullable() }),
) {}
// FRD-05, D7-50: the automatic check.
export class FraudRuleDto extends createZodDto(
  z.object({ codOrders: z.boolean(), minAmount: z.string().nullable() }),
) {}

import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  SMS_VARIABLES,
  SmsBlockedReason,
  SmsEvent,
  SmsLogKind,
  SmsLogStatus,
  smsLogQuerySchema,
  smsReportQuerySchema,
  smsSettingsUpdateSchema,
} from '@lytronix/validators';

export class SmsSettingsUpdateDto extends createZodDto(smsSettingsUpdateSchema) {}
export class SmsReportQueryDto extends createZodDto(smsReportQuerySchema) {}
export class SmsLogQueryDto extends createZodDto(smsLogQuerySchema) {}

const kindSchema = z.union([z.nativeEnum(SmsLogKind), z.nativeEnum(SmsEvent)]);

// SMS-12: per order before the shop has any, else a month from its last 30 days.
const estimateSchema = z.discriminatedUnion('basis', [
  z.object({ basis: z.literal('per_order'), cost: z.string() }),
  z.object({ basis: z.literal('last_30_days'), count: z.number().int(), cost: z.string() }),
]);

// SMS-02, SMS-03, SMS-10, SMS-12, SMS-19: one SMS event as the settings screen shows it.
const smsEventSchema = z.object({
  event: z.nativeEnum(SmsEvent),
  recipient: z.enum(['shopper', 'owner']),
  on: z.boolean(),
  template: z.string(),
  edited: z.boolean(),
  defaultTemplate: z.string(),
  variables: z.array(z.enum(SMS_VARIABLES)),
  sample: z.string(),
  units: z.number().int(),
  estimate: estimateSchema,
});

export class SmsSettingsDto extends createZodDto(
  z.object({
    events: z.array(smsEventSchema),
    // Slice 7.7: each essential SMS as it reads, and who pays for it; and where the owner's own SMS go.
    essentials: z.array(
      z.object({
        kind: z.enum(['shopper_code', 'staff_reset_code', 'shop_ready']),
        words: z.string(),
        payer: z.enum(['balance', 'free_then_balance', 'free']),
      }),
    ),
    ownerPhone: z.string().nullable(),
    smsName: z.string(),
    usesShopName: z.boolean(),
    shopName: z.string(),
    monthlySpendCap: z.string().nullable(),
    spentThisMonth: z.string(),
    unitSize: z.number().int(),
    rate: z.string(),
  }),
) {}

// SMS-14: each day's SMS by kind.
export class SmsReportDto extends createZodDto(
  z.object({
    dateFrom: z.string(),
    dateTo: z.string(),
    days: z.array(
      z.object({
        day: z.string(),
        kind: kindSchema,
        sent: z.number().int(),
        failed: z.number().int(),
        blocked: z.number().int(),
        units: z.number().int(),
        cost: z.string(),
      }),
    ),
  }),
) {}

// SMS-07, SMS-17: the shop's SMS, newest first.
export class SmsLogDto extends createZodDto(
  z.object({
    sms: z.array(
      z.object({
        id: z.number().int(),
        kind: kindSchema,
        toPhone: z.string(),
        units: z.number().int(),
        cost: z.string(),
        status: z.nativeEnum(SmsLogStatus),
        blockedReason: z.nativeEnum(SmsBlockedReason).nullable(),
        orderId: z.string().nullable(),
        body: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
  }),
) {}

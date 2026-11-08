import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  auditListQuerySchema,
  ConsumerMetric,
  consumersQuerySchema,
  LedgerEntryType,
  reportQuerySchema,
  TenantState,
} from '@lytronix/validators';

// ADM-08, ADM-09 (Phase 8 Slice 8.4): the operator's reports and audit log list, as the console reads them.

export class ReportQueryDto extends createZodDto(reportQuerySchema) {}
export class ConsumersQueryDto extends createZodDto(consumersQuerySchema) {}
export class AuditListQueryDto extends createZodDto(auditListQuerySchema) {}

const money = z.string();

const revenueFiguresSchema = z.object({
  wallet: z.object({ purchase: money, renewal: money, upgrade: money, addon: money }),
  balance: z.record(z.nativeEnum(LedgerEntryType), money),
  givenBack: money,
  earned: money,
});

export const revenueReportSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  buckets: z.array(revenueFiguresSchema.extend({ from: z.string(), to: z.string() })),
  total: revenueFiguresSchema,
  recordedSince: z.string().nullable(),
});
export class RevenueReportDto extends createZodDto(revenueReportSchema) {}

const movementsSchema = z.object({
  opened: z.number().int(),
  becamePaying: z.number().int(),
  lapsed: z.number().int(),
});

export const shopsReportSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  now: z.object({
    total: z.number().int(),
    byState: z.array(z.object({ state: z.nativeEnum(TenantState), count: z.number().int() })),
    byPlan: z.array(
      z.object({
        planId: z.string().nullable(),
        planName: z.string().nullable(),
        count: z.number().int(),
      }),
    ),
  }),
  buckets: z.array(movementsSchema.extend({ from: z.string(), to: z.string() })),
  total: movementsSchema,
});
export class ShopsReportDto extends createZodDto(shopsReportSchema) {}

export const consumersReportSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  metric: z.nativeEnum(ConsumerMetric),
  shops: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      ownerPhone: z.string().nullable(),
      value: z.number(),
    }),
  ),
});
export class ConsumersReportDto extends createZodDto(consumersReportSchema) {}

export const auditLogPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      actorType: z.string(),
      actorId: z.string().nullable(),
      actorEmail: z.string().nullable(),
      action: z.string(),
      targetType: z.string().nullable(),
      targetId: z.string().nullable(),
      result: z.string(),
      summary: z.unknown(),
      createdAt: z.date(),
      shop: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable(),
    }),
  ),
  next: z.number().int().nullable(),
});
export class AuditLogPageDto extends createZodDto(auditLogPageSchema) {}

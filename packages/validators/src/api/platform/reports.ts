import { z } from 'zod';
import { calendarDayField, checkPeriod } from '../../common/dates';
import { ConsumerMetric, PlatformAuditAction, SalesBucket } from '../../db/enums';

// ADM-09, D8-10, D8-40 to D8-46 (Phase 8 Slice 8.4, read agreed 2026-11-08): the operator's reports, over whole
// Asia/Dhaka days (left out: the first of this month to today), read by the console or kept as a CSV (`.../export`).

// GET /operator/reports/revenue and /operator/reports/shops: split into Saturday weeks, months, quarters or years, as
// STA-01's sales figures are.
export const reportQuerySchema = z
  .object({
    dateFrom: calendarDayField.optional(),
    dateTo: calendarDayField.optional(),
    bucket: z.nativeEnum(SalesBucket).default(SalesBucket.Month),
  })
  .strict()
  .superRefine(checkPeriod);
export type ReportQuery = z.infer<typeof reportQuerySchema>;

// GET /operator/reports/consumers: the shops that used most of one thing in the period.
export const consumersQuerySchema = z
  .object({
    dateFrom: calendarDayField.optional(),
    dateTo: calendarDayField.optional(),
    metric: z.nativeEnum(ConsumerMetric),
  })
  .strict()
  .superRefine(checkPeriod);
export type ConsumersQuery = z.infer<typeof consumersQuerySchema>;

// GET /operator/audit (ADM-08, D8-11): the platform audit log, newest first, filtered, in keyset pages.
export const auditListQuerySchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    actorId: z.string().uuid().optional(),
    action: z.nativeEnum(PlatformAuditAction).optional(),
    dateFrom: calendarDayField.optional(),
    dateTo: calendarDayField.optional(),
    cursor: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .superRefine(checkPeriod);
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

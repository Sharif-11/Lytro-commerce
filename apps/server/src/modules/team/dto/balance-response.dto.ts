import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { LedgerEntryType, RateKey, TenantState } from '@lytronix/validators';

export const balanceSnapshotSchema = z.object({
  amount: z.string(),
  frozen: z.boolean(),
});
export class BalanceSnapshotDto extends createZodDto(balanceSnapshotSchema) {}

export const ledgerEntrySchema = z.object({
  id: z.number(),
  type: z.nativeEnum(LedgerEntryType),
  amount: z.string(),
  units: z.string().nullable(),
  rateUsed: z.string().nullable(),
  reference: z.unknown(),
  balanceAfter: z.string(),
  createdAt: z.date(),
});
export class LedgerEntryDto extends createZodDto(ledgerEntrySchema) {}

export const ledgerPageSchema = z.object({
  entries: z.array(ledgerEntrySchema),
  nextCursor: z.number().nullable(),
});
export class LedgerPageDto extends createZodDto(ledgerPageSchema) {}

export const rateValueSchema = z.object({
  key: z.nativeEnum(RateKey),
  value: z.string(),
  effectiveFrom: z.date(),
});
export class RateValueDto extends createZodDto(rateValueSchema) {}

export const rateHistoryEntrySchema = z.object({
  id: z.number(),
  key: z.nativeEnum(RateKey),
  oldValue: z.string().nullable(),
  newValue: z.string(),
  changedBy: z.string().nullable(),
  noticeId: z.string().nullable(),
  changedAt: z.date(),
});
export class RateHistoryEntryDto extends createZodDto(rateHistoryEntrySchema) {}

// LIF-24: the operator's own tenant search result -- a leaner cut of TenantSummary (no planLimits, not
// needed by this list screen).
export const tenantSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  shopName: z.string(),
  state: z.nativeEnum(TenantState),
  suspendedAt: z.date().nullable(),
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  periodEnd: z.date().nullable(),
});
export class TenantSummaryDto extends createZodDto(tenantSummarySchema) {}

export const tenantSummaryPageSchema = z.object({
  entries: z.array(tenantSummarySchema),
  nextCursor: z.string().nullable(),
});
export class TenantSummaryPageDto extends createZodDto(tenantSummaryPageSchema) {}

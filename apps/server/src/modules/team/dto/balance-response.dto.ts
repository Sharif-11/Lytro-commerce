import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { LedgerEntryType, RateKey, TenantState } from '@lytronix/validators';

// BAL-01, BAL-04: the balance, and the top-up bounds the sheet states before a quote (the quote still holds to them).
export const balanceViewSchema = z.object({
  amount: z.string(),
  frozen: z.boolean(),
  topUpMin: z.number(),
  topUpMax: z.number(),
  // PYG-02, PYG-16: the pay-as-you-go fees charged since the 1st of this month in Asia/Dhaka.
  feesThisMonth: z.string(),
});
export class BalanceViewDto extends createZodDto(balanceViewSchema) {}

// AUTH-21: the shop's own essential-SMS usage against its plan's allowance. `null` limits mean unlimited
// (PLN-19's convention) -- a plan that never set either field falls back to the same `null`, since there's
// no established "default allowance" constant yet (unlike DEFAULT_SEATS for staff).
export const essentialSmsUsageSchema = z.object({
  monthlyUsed: z.number(),
  totalUsed: z.number(),
  monthlyLimit: z.number().nullable(),
  totalLimit: z.number().nullable(),
});
export class EssentialSmsUsageDto extends createZodDto(essentialSmsUsageSchema) {}

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

export const platformWalletSchema = z.object({
  id: z.string(),
  provider: z.string(),
  number: z.string(),
  label: z.string().nullable(),
  enabled: z.boolean(),
  displayOrder: z.number(),
  createdAt: z.date(),
});
export class PlatformWalletDto extends createZodDto(platformWalletSchema) {}

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

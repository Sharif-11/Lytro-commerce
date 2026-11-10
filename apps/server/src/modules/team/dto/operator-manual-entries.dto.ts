import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  evidenceUploadSchema,
  manualEntryListSchema,
  manualEntryPreviewSchema,
  manualEntrySchema,
  PlanPaymentKind,
  reverseManualEntrySchema,
} from '@lytronix/validators';

// ADM-14, ADM-15, ADM-17 (Phase 8 Slice 8.5): manual entries and payment screenshots, as the console and the dashboard
// send and read them.

export class EvidenceUploadDto extends createZodDto(evidenceUploadSchema) {}
export class ManualEntryPreviewDto extends createZodDto(manualEntryPreviewSchema) {}
export class ManualEntryDto extends createZodDto(manualEntrySchema) {}
export class ReverseManualEntryDto extends createZodDto(reverseManualEntrySchema) {}
export class ManualEntryListDto extends createZodDto(manualEntryListSchema) {}

export const evidenceUploadResponseSchema = z.object({
  key: z.string(),
  upload: z.object({
    url: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.coerce.date(),
  }),
});
export class EvidenceUploadResponseDto extends createZodDto(evidenceUploadResponseSchema) {}

export const evidenceLinkSchema = z.object({ url: z.string(), expiresAt: z.coerce.date() });
export class EvidenceLinkDto extends createZodDto(evidenceLinkSchema) {}

export const manualEntryPreviewResponseSchema = z.object({
  kind: z.nativeEnum(PlanPaymentKind),
  amount: z.string(),
  creditAmount: z.string(),
  addons: z.array(
    z.object({
      key: z.string(),
      labelEn: z.string(),
      labelBn: z.string(),
      quantity: z.number(),
      price: z.string(),
    }),
  ),
  periodEnd: z.coerce.date().nullable(),
  needsConfirmation: z.boolean(),
});
export class ManualEntryPreviewResponseDto extends createZodDto(manualEntryPreviewResponseSchema) {}

export const manualEntryViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  shopName: z.string(),
  shopSlug: z.string(),
  planPaymentId: z.string(),
  kind: z.nativeEnum(PlanPaymentKind),
  planName: z.string().nullable(),
  amount: z.string(),
  walletId: z.string().nullable(),
  transactionId: z.string().nullable(),
  senderNumber: z.string().nullable(),
  paidAt: z.coerce.date().nullable(),
  evidenceId: z.string().nullable(),
  evidenceLine: z.string().nullable(),
  reason: z.string(),
  enteredBy: z.string(),
  enteredByEmail: z.string().nullable(),
  reversesEntryId: z.string().nullable(),
  reversedBy: z.object({ id: z.string(), reason: z.string(), at: z.coerce.date() }).nullable(),
  createdAt: z.coerce.date(),
});
export class ManualEntryViewDto extends createZodDto(manualEntryViewSchema) {}

export const manualEntryPageSchema = z.object({
  entries: z.array(manualEntryViewSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export class ManualEntryPageDto extends createZodDto(manualEntryPageSchema) {}

import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  ReconciliationDifferenceKind,
  ReconciliationDifferenceState,
  reconciliationListQuerySchema,
  reconciliationResolveSchema,
} from '@lytronix/validators';

// DAT-52 (Phase 9 Slice 9.5): the daily reconciliation's differences, as the console lists and resolves them. Amounts are
// taka to two places; what a difference is about is an id.

export class ReconciliationListQueryDto extends createZodDto(reconciliationListQuerySchema) {}
export class ReconciliationResolveDto extends createZodDto(reconciliationResolveSchema) {}

export const reconciliationDifferenceSchema = z.object({
  id: z.string(),
  day: z.string(),
  kind: z.nativeEnum(ReconciliationDifferenceKind),
  subject: z.string(),
  tenantId: z.string().nullable(),
  expected: z.string().nullable(),
  found: z.string().nullable(),
  details: z.record(z.union([z.string(), z.number(), z.null()])),
  state: z.nativeEnum(ReconciliationDifferenceState),
  note: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  resolvedAt: z.date().nullable(),
  createdAt: z.date(),
});
export class ReconciliationDifferenceDto extends createZodDto(reconciliationDifferenceSchema) {}

export const reconciliationDifferencePageSchema = z.object({
  differences: z.array(reconciliationDifferenceSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class ReconciliationDifferencePageDto extends createZodDto(
  reconciliationDifferencePageSchema,
) {}

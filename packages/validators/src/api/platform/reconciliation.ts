import { z } from 'zod';
import { calendarDayField } from '../../common/dates';
import { RECONCILIATION_NOTE_MAX_LENGTH } from '../../common/limits';
import { ReconciliationDifferenceKind, ReconciliationDifferenceState } from '../../db/enums';

// DAT-52, D9-16 (Phase 9 Slice 9.5): the daily reconciliation's differences, as the operator lists and resolves them.

/** GET operator/reconciliation/differences: open ones by default, newest day first; a day or a kind narrows it. */
export const reconciliationListQuerySchema = z
  .object({
    state: z.nativeEnum(ReconciliationDifferenceState).default(ReconciliationDifferenceState.Open),
    day: calendarDayField.optional(),
    kind: z.nativeEnum(ReconciliationDifferenceKind).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type ReconciliationListQuery = z.infer<typeof reconciliationListQuerySchema>;

/** POST operator/reconciliation/differences/:id/resolve: what the operator did about it, in their own words. */
export const reconciliationResolveSchema = z
  .object({
    note: z.string().trim().min(1).max(RECONCILIATION_NOTE_MAX_LENGTH),
  })
  .strict();
export type ReconciliationResolveInput = z.infer<typeof reconciliationResolveSchema>;

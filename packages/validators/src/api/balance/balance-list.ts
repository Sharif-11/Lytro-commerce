import { z } from 'zod';
import { LedgerEntryType } from '../../db/enums';
import { coercedDateField } from '../../common/dates';

// One ledger type or several, comma-separated (`type=order_fee,product_fee`): a statement chip such as Fees covers more
// than one kind of row (Slice 11.5b). A single type reads as before.
// SEC-12: the longest list there is names every type once.
const ledgerTypesField = z
  .string()
  .max(Object.values(LedgerEntryType).join(',').length)
  .transform((value) => value.split(','))
  .pipe(z.array(z.enum(LedgerEntryType)).min(1));

// ENGINEERING-STANDARDS §5, recipe 6: a ledger row's type as a response states it, a kind this release names or one a
// later release adds. The release before a new kind runs beside it while it deploys and is what a rollback goes back
// to, so it answers that kind's rows as they are instead of failing the whole statement. Filters stay to the kinds
// this release names.
export const ledgerEntryTypeOfRow = z.union([z.enum(LedgerEntryType), z.string().min(1).max(63)]);

// GET /balance/ledger: filters for the statement page (BAL-14). Keyset pagination, never OFFSET.
export const listLedgerSchema = z.object({
  type: ledgerTypesField.optional(),
  dateFrom: coercedDateField().optional(),
  dateTo: coercedDateField().optional(),
  // Opaque: the id of the last row the caller saw.
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListLedgerQuery = z.infer<typeof listLedgerSchema>;

// GET /balance/ledger/export (BAL-14): the same filters, minus pagination -- a CSV covers the whole filtered
// range, not one page.
export const exportLedgerSchema = z.object({
  type: ledgerTypesField.optional(),
  dateFrom: coercedDateField().optional(),
  dateTo: coercedDateField().optional(),
});
export type ExportLedgerQuery = z.infer<typeof exportLedgerSchema>;

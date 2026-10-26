import { z } from 'zod';
import { LedgerEntryType } from '../../db/enums';

// One ledger type or several, comma-separated (`type=order_fee,product_fee`): a statement chip such as Fees covers more
// than one kind of row (Slice 11.5b). A single type reads as before.
const ledgerTypesField = z
  .string()
  .transform((value) => value.split(','))
  .pipe(z.array(z.nativeEnum(LedgerEntryType)).min(1));

// GET /balance/ledger: filters for the statement page (BAL-14). Keyset pagination, never OFFSET.
export const listLedgerSchema = z.object({
  type: ledgerTypesField.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  // Opaque: the id of the last row the caller saw.
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListLedgerQuery = z.infer<typeof listLedgerSchema>;

// GET /balance/ledger/export (BAL-14): the same filters, minus pagination -- a CSV covers the whole filtered
// range, not one page.
export const exportLedgerSchema = z.object({
  type: ledgerTypesField.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export type ExportLedgerQuery = z.infer<typeof exportLedgerSchema>;

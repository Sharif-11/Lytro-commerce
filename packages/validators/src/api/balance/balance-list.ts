import { z } from 'zod';
import { LedgerEntryType } from '../../db/enums';

// GET /balance/ledger: filters for the statement page (BAL-14). Keyset pagination, never OFFSET.
export const listLedgerSchema = z.object({
  type: z.nativeEnum(LedgerEntryType).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  // Opaque: the id of the last row the caller saw.
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListLedgerQuery = z.infer<typeof listLedgerSchema>;

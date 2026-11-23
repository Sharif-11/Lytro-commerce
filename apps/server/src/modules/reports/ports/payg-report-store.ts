import type { PayAsYouGoShopRow } from '@lytronix/db';
import type { LedgerTotals } from './shop-day-store';

/** PYG-13 as amended (PAYG-FAIR-USE-PLAN PF-38): what the operator's fair-use report reads, each shop in its own RLS. */
export interface PaygReportStore {
  shops(): Promise<PayAsYouGoShopRow[]>;
  orderCounts(
    tenantId: string,
    from: Date,
  ): Promise<{ received: number; opened: number; confirmed: number }>;
  ledgerTotals(tenantId: string, from: Date, to: Date): Promise<LedgerTotals[]>;
  apiSince(tenantId: string, fromDay: string): Promise<{ requests: number; billable: number }>;
}

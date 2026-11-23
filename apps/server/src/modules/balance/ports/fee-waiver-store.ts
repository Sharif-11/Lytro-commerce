import type { Transaction } from '@lytronix/db';

/**
 * WAL-20, WAL-21 (amended 2026-11-23): whether a shop pays no payment-check fee, because its plan's feature snapshot, or
 * an add-on it holds now, carries VERIFICATION_FEES_WAIVED_FEATURE (the Pilot plan does). Read in the payment's own
 * transaction.
 */
export interface FeeWaiverStore {
  waived(tx: Transaction, tenantId: string): Promise<boolean>;
}

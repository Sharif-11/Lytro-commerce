import type { Transaction } from '@lytronix/db';

/**
 * The bandwidth each shop used before D9-31 took media bandwidth out of the plans. Nothing is counted any more; the
 * rows stay until a later release drops their tables, so a lapsed shop's are still deleted with it (LIF-19).
 */
export interface BandwidthStore {
  /** LIF-19: a lapsed shop's old bandwidth records, at day 60. */
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}

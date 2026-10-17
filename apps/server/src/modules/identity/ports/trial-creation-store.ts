import type { Transaction } from '@lytronix/db';

/** control.trial_creations (AUTH-09). Tx-joined, so it rolls back with a failed shop-creation attempt. */
export interface TrialCreationStore {
  countByIdentitySince(tx: Transaction, identityId: string, since: Date): Promise<number>;
  countByIpSince(tx: Transaction, ip: string, since: Date): Promise<number>;
  record(tx: Transaction, identityId: string, ip: string | null): Promise<void>;
}

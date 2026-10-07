import type { ClaimedOutboxRow } from '@lytronix/db';

/** The outbox table the job relay reads from (D25). The queue module's own adapter implements this. */
export interface OutboxStore {
  claimDue(now: Date, leaseUntil: Date, limit: number): Promise<ClaimedOutboxRow[]>;
  markSent(id: number, jobId: string | null): Promise<void>;
}

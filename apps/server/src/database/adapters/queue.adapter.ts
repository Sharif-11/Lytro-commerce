import { Inject, Injectable } from '@nestjs/common';
import { JobOutboxRepository, type ClaimedOutboxRow } from '@lytronix/db';
import type { OutboxStore } from '../../modules/shared/queue/ports/outbox-store';
import { DatabaseService } from '../database.service';

/** Reads and updates the job outbox table (D25). */
@Injectable()
export class DrizzleOutboxStore implements OutboxStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(JobOutboxRepository) private readonly outbox: JobOutboxRepository,
  ) {}

  claimDue(now: Date, leaseUntil: Date, limit: number): Promise<ClaimedOutboxRow[]> {
    return this.outbox.claimDue(this.database.handle.db, { now, leaseUntil, limit });
  }

  markSent(id: number, jobId: string | null): Promise<void> {
    return this.outbox.markSent(this.database.handle.db, id, jobId);
  }
}

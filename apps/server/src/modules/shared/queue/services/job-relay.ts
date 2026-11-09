import { createHash } from 'node:crypto';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { SendOptions } from 'pg-boss';
import { SECOND_MS } from '../../../../common/time';
import type { OutboxStore } from '../ports/outbox-store';
import { OUTBOX_STORE } from '../tokens';
import { PgBossClient } from './pg-boss-client';

// How long a claim is held before another relay instance may reclaim it (a crashed relay's safety net).
const LEASE_MS = 30 * SECOND_MS;
// The relay's own poll interval: a fallback only — pg-boss's own `notify: true` queues dispatch instantly once
// a job reaches pg-boss. Not started under NODE_ENV=test, where tests call runDue directly.
export const RELAY_INTERVAL_MS = 2 * SECOND_MS;

/**
 * The pg-boss ID of one outbox row, the same every time (a UUID, RFC 4122's name-based form): a relay that sent a row and
 * stopped before marking it sends it again under its lease, and pg-boss keeps the one job.
 */
export function outboxJobId(rowId: number): string {
  const hex = createHash('sha1')
    .update(`job_outbox:${String(rowId)}`)
    .digest('hex');
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Hands rows from our own outbox table to pg-boss (D25). This is the one place outside the outbox store that
 * knows the outbox table exists, and the one place that calls pg-boss's `send()`.
 */
@Injectable()
export class JobRelay implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    this.timer = setInterval(() => {
      this.runDue().catch((error: unknown) => {
        console.error(
          `[job-relay] run failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, RELAY_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Claims due rows and sends each to pg-boss. Tests call this directly instead of waiting on the timer. */
  async runDue(limit = 20): Promise<number> {
    const now = new Date();
    const claimed = await this.outbox.claimDue(now, new Date(now.getTime() + LEASE_MS), limit);
    for (const row of claimed) {
      const options: SendOptions = { id: outboxJobId(row.id) };
      if (row.singletonKey) options.singletonKey = row.singletonKey;
      if (row.expireInSeconds != null) options.expireInSeconds = row.expireInSeconds;
      if (row.retryLimit != null) options.retryLimit = row.retryLimit;
      if (row.retryDelay != null) options.retryDelay = row.retryDelay;
      const jobId = await this.pgBoss.boss.send(row.queueName, row.payload as object, options);
      await this.outbox.markSent(row.id, jobId);
    }
    return claimed.length;
  }
}

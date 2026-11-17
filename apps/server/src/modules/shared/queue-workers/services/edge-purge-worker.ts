import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { EdgePurgeRunner } from '../../edge-cache/services/edge-purge-runner';
import type { EdgePurgeJob } from '../../edge-cache/types/edge-purge-job';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// D9-32: Cloudflare's purge by tag allows 5 requests a minute on the Free plan, so the queue is read every 12 seconds,
// not woken by each job, and up to 100 jobs at a time go out as one request (EdgePurgeRunner).
const BATCH = 100;
const POLL_SECONDS = 12;

/**
 * D9-32 (Slice 9.10): drops the shop pages Cloudflare keeps once what they show has changed, queued in the transaction
 * that changed it (SCL-08). A refused or failed purge is tried again later; until then the pages run out in 5 minutes.
 */
@Injectable()
export class EdgePurgeWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(EdgePurgeRunner) private readonly runner: EdgePurgeRunner,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.EdgePurge, {
      retryLimit: 20,
      retryDelay: 15,
      retryBackoff: true,
    });
    await this.pgBoss.boss.work<EdgePurgeJob>(
      QueueName.EdgePurge,
      { batchSize: BATCH, pollingIntervalSeconds: POLL_SECONDS },
      async (jobs) => {
        await this.runner.run(jobs.map((job) => job.data));
      },
    );
  }
}

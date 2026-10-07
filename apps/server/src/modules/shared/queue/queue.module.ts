import { Module } from '@nestjs/common';
import { DrizzleOutboxStore } from '../../../database/adapters/queue.adapter';
import { OutboxJobQueue } from './adapters/outbox-job-queue.adapter';
import { JobRelay } from './services/job-relay';
import { PgBossClient } from './services/pg-boss-client';
import { JOB_QUEUE, OUTBOX_STORE } from './tokens';

// SCL-08, D25: the job queue, as a leaf module. Imports nothing of its own, so any module can enqueue a job
// without creating an import cycle. Registering queues and work handlers is a separate module's job
// (queue-workers), which needs PgBossClient to do it — exported here for that purpose only; producers only ever
// see the JOB_QUEUE port.
@Module({
  providers: [
    PgBossClient,
    JobRelay,
    { provide: OUTBOX_STORE, useClass: DrizzleOutboxStore },
    { provide: JOB_QUEUE, useClass: OutboxJobQueue },
  ],
  exports: [JOB_QUEUE, PgBossClient],
})
export class QueueModule {}

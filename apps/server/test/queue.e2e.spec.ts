import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueName } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { DatabaseService } from '../src/database/database.service';
import { JOB_QUEUE } from '../src/modules/shared/queue/tokens';
import type { JobQueue } from '../src/modules/shared/queue/ports/job-queue';
import { JobRelay } from '../src/modules/shared/queue/services/job-relay';
import { PgBossClient } from '../src/modules/shared/queue/services/pg-boss-client';
import { prepareTestDatabase } from './support/database';

// The queue's own mechanics (SCL-08, D25): the enqueue step's atomicity, and the full path from enqueue through
// the relay to pg-boss actually dispatching a worker. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_queue_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let admin: pg.Client;
let database: Pick<DatabaseService, 'handle'>;
let jobQueue: JobQueue;
let relay: JobRelay;
let pgBoss: PgBossClient;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'queue-e2e-otp-secret-0123456789abcdefghi';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  database = moduleRef.get(DatabaseService);
  jobQueue = moduleRef.get(JOB_QUEUE);
  relay = moduleRef.get(JobRelay);
  pgBoss = moduleRef.get(PgBossClient);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('the job outbox and relay (SCL-08, D25)', () => {
  it('rolls back the outbox row with the transaction that enqueued it', async () => {
    await database.handle.db
      .transaction(async (tx) => {
        await jobQueue.enqueue(tx, QueueName.Sms, { marker: 'rolled-back' });
        throw new Error('force a rollback');
      })
      .catch(() => undefined);

    const rows = await admin.query(
      `SELECT 1 FROM control.job_outbox WHERE payload->>'marker' = 'rolled-back'`,
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('enqueues, relays, and pg-boss dispatches the worker', async () => {
    const received: unknown[] = [];
    await pgBoss.boss.createQueue(QueueName.Sms, { notify: true });
    await pgBoss.boss.work<{ marker: string }>(QueueName.Sms, (jobs) => {
      for (const job of jobs) received.push(job.data.marker);
      return Promise.resolve();
    });

    await database.handle.db.transaction(async (tx) => {
      await jobQueue.enqueue(tx, QueueName.Sms, { marker: 'end-to-end' });
    });

    const claimed = await relay.runDue();
    expect(claimed).toBeGreaterThanOrEqual(1);

    const outboxRow = await admin.query<{ status: string; job_id: string | null }>(
      `SELECT status, job_id FROM control.job_outbox WHERE payload->>'marker' = 'end-to-end'`,
    );
    expect(outboxRow.rows[0]).toMatchObject({ status: 'sent' });
    expect(outboxRow.rows[0]?.job_id).toEqual(expect.any(String));

    // pg-boss's own dispatch to the worker is asynchronous even after send() succeeds; poll briefly for it.
    const deadline = Date.now() + 5000;
    while (!received.includes('end-to-end') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(received).toContain('end-to-end');
  });
});

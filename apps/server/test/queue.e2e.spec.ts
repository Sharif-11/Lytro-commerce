import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueueName } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { DatabaseService } from '../src/database/database.service';
import { JOB_QUEUE, OUTBOX_STORE } from '../src/modules/shared/queue/tokens';
import type { OutboxStore } from '../src/modules/shared/queue/ports/outbox-store';
import type { JobQueue } from '../src/modules/shared/queue/ports/job-queue';
import { JobRelay } from '../src/modules/shared/queue/services/job-relay';
import {
  FINISHED_JOBS_KEPT_SECONDS,
  PgBossClient,
} from '../src/modules/shared/queue/services/pg-boss-client';
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
let outbox: OutboxStore;
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
  outbox = moduleRef.get(OUTBOX_STORE);
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

  it('a relay that stops after sending a row, before marking it, leaves one job (Phase 7 close-out)', async () => {
    await database.handle.db.transaction(async (tx) => {
      await jobQueue.enqueue(tx, QueueName.Sms, { marker: 'sent-twice' });
    });
    const marking = vi
      .spyOn(outbox, 'markSent')
      .mockRejectedValueOnce(new Error('the server stopped'));
    await expect(relay.runDue()).rejects.toThrow('the server stopped');
    expect(marking).toHaveBeenCalledTimes(1);
    await admin.query(
      `UPDATE control.job_outbox SET lease_until = now() - interval '1 minute' WHERE payload->>'marker' = 'sent-twice'`,
    );
    expect(await relay.runDue()).toBeGreaterThanOrEqual(1);
    const row = await admin.query<{ status: string }>(
      `SELECT status FROM control.job_outbox WHERE payload->>'marker' = 'sent-twice'`,
    );
    expect(row.rows).toEqual([{ status: 'sent' }]);
    const jobs = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pgboss.job WHERE name = $1 AND data->>'marker' = 'sent-twice'`,
      [QueueName.Sms],
    );
    expect(jobs.rows[0]?.n).toBe(1);
  });

  it("sweeps what it sent over a week ago, and claims through the index of what isn't sent (Slice 9.10)", async () => {
    await admin.query(
      `INSERT INTO control.job_outbox (queue_name, payload, status, sent_at) VALUES
         ($1, '{"marker":"swept-old"}', 'sent', now() - interval '8 days'),
         ($1, '{"marker":"swept-recent"}', 'sent', now() - interval '1 day')`,
      [QueueName.Sms],
    );
    expect(await relay.sweepSent()).toBeGreaterThanOrEqual(1);
    const left = await admin.query<{ marker: string }>(
      `SELECT payload->>'marker' AS marker FROM control.job_outbox WHERE payload->>'marker' LIKE 'swept-%'`,
    );
    expect(left.rows).toEqual([{ marker: 'swept-recent' }]);

    // The claim's own condition (job-outbox.repository.ts), with table scans off: on a test's few rows the planner would
    // read the table whole, and this asks only whether the index of unsent rows can serve it.
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL enable_seqscan = off');
      const plan = await admin.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT id FROM control.job_outbox
         WHERE status = 'pending' OR (status = 'sending' AND (lease_until IS NULL OR lease_until <= now()))
         ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED`,
      );
      expect(plan.rows.map((row) => row['QUERY PLAN']).join(' ')).toContain(
        'job_outbox_unsent_idx',
      );
    } finally {
      await admin.query('ROLLBACK');
    }
  });

  it("keeps a queue's finished jobs two days, pg-boss's schedule queue's too, unless it says (Slice 9.10)", async () => {
    const kept = async (name: string): Promise<number | undefined> => {
      const row = await admin.query<{ seconds: number }>(
        'SELECT deletion_seconds AS seconds FROM pgboss.queue WHERE name = $1',
        [name],
      );
      return row.rows[0]?.seconds;
    };
    await pgBoss.boss.createQueue(QueueName.Sms, { notify: true });
    expect(await kept(QueueName.Sms)).toBe(FINISHED_JOBS_KEPT_SECONDS);
    expect(await kept('__pgboss__send-it')).toBe(FINISHED_JOBS_KEPT_SECONDS);

    // A queue made before this, with pg-boss's week, is told again when it's created again at the next start.
    await admin.query(`UPDATE pgboss.queue SET deletion_seconds = 604800 WHERE name = $1`, [
      QueueName.Sms,
    ]);
    await pgBoss.boss.createQueue(QueueName.Sms, { notify: true });
    expect(await kept(QueueName.Sms)).toBe(FINISHED_JOBS_KEPT_SECONDS);

    await pgBoss.boss.createQueue('slice-9-10-own-keeping', { deleteAfterSeconds: 3600 });
    expect(await kept('slice-9-10-own-keeping')).toBe(3600);
  });
});

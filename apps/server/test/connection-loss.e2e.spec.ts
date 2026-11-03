import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueName } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PgBossClient } from '../src/modules/shared/queue/services/pg-boss-client';
import { prepareTestDatabase } from './support/database';

// The real thing connection-loss.spec.ts cannot reach: the database ends every connection a running server
// holds. An 'error' event nobody hears ends the process, and Vitest fails the run on it even if each check
// below passes. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_connection_loss_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let admin: pg.Client;
let database: Pick<DatabaseService, 'handle'>;
let pgBoss: PgBossClient;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'connection-loss-e2e-otp-secret-0123456789abcdefg';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  database = moduleRef.get(DatabaseService);
  pgBoss = moduleRef.get(PgBossClient);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('a database that ends every connection', () => {
  it('leaves the server running, and its pool and job queue working again', async () => {
    await database.handle.db.transaction(() => Promise.resolve());
    const received: string[] = [];
    await pgBoss.boss.createQueue(QueueName.Sms, { notify: true });
    await pgBoss.boss.work<{ marker: string }>(QueueName.Sms, (jobs) => {
      for (const job of jobs) received.push(job.data.marker);
      return Promise.resolve();
    });

    const ended = await admin.query<{ count: number }>(
      `SELECT count(pg_terminate_backend(pid))::int AS count FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid()
         AND application_name IN ('lytronix-server', 'lytronix-queue')`,
    );
    expect(ended.rows[0]?.count).toBeGreaterThanOrEqual(2);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await database.handle.db.transaction(() => Promise.resolve());

    await pgBoss.boss.send(QueueName.Sms, { marker: 'after-the-loss' });
    // No notification now if pg-boss's listener went with the rest; its polling is the fallback (D25).
    const deadline = Date.now() + 15_000;
    while (!received.includes('after-the-loss') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(received).toContain('after-the-loss');
  }, 30_000);
});

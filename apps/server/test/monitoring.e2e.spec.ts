import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CapacityRepository, JobHeartbeatRepository, type PreparedDatabase } from '@lytronix/db';
import { EnvironmentParser } from '../src/config/env';
import { DrizzleMonitoringDatabase } from '../src/database/adapters/monitoring.adapter';
import { DatabaseService } from '../src/database/database.service';
import { JobHeartbeats } from '../src/modules/monitoring/services/job-heartbeats';
import { JobsCheck } from '../src/modules/monitoring/services/jobs-check';
import { PgBossClient } from '../src/modules/shared/queue/services/pg-boss-client';
import { prepareTestDatabase, seedShop } from './support/database';

// OBS-02 (Slice 9.6): a scheduled job's pass records its heartbeat as the app's role, and the jobs' check reads
// pg-boss's own schedule against it, on a migrated database. DAT-55: the second server's figures, as the app reads them.
const ADMIN = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_monitoring_test';
const describeIfDatabase = ADMIN ? describe : describe.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let urls: PreparedDatabase;
let database: DatabaseService;
let monitoring: DrizzleMonitoringDatabase;
let admin: pg.Client;
let ready = false;

beforeAll(async () => {
  if (!ADMIN) return;
  urls = await prepareTestDatabase(ADMIN, DB_NAME);
  database = new DatabaseService(
    new EnvironmentParser().parse({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: urls.appDbUrl,
      OTP_SECRET: 'monitoring-e2e-otp-secret-0123456789abcdef',
    }),
  );
  monitoring = new DrizzleMonitoringDatabase(
    database,
    new JobHeartbeatRepository(),
    new CapacityRepository(),
  );
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  ready = true;
}, 180_000);

afterAll(async () => {
  if (!ready) return;
  await admin.end();
  await database.onApplicationShutdown();
});

describeIfDatabase('job heartbeats and the jobs check (Slice 9.6)', () => {
  it('records a heartbeat for a pass that finished, none for one that failed, and reports the failure', async () => {
    const done = `monitoring-done-${randomUUID().slice(0, 8)}`;
    const failing = `monitoring-failing-${randomUUID().slice(0, 8)}`;
    const worker = new PgBossClient(
      { DATABASE_URL: urls.appDbUrl, SERVER_ROLE: 'worker' },
      undefined,
      undefined,
      new JobHeartbeats(monitoring, () => new Date()),
      // OBS-03: a failed job goes to the error tracker with its queue.
      { capture: (_error, scope) => reported.push(scope.job ?? '') },
    );
    const reported: string[] = [];
    let ran = 0;
    let failed = 0;
    try {
      await worker.onModuleInit();
      await worker.boss.createQueue(done);
      await worker.boss.createQueue(failing, { retryLimit: 0 });
      await worker.workOnce(done, () => {
        ran += 1;
        return Promise.resolve();
      });
      await worker.workOnce(failing, () => {
        failed += 1;
        return Promise.reject(new Error('this pass fails'));
      });
      await worker.boss.send(done, {});
      await worker.boss.send(failing, {});
      for (let waited = 0; waited < 15_000 && (ran === 0 || failed === 0); waited += 250)
        await sleep(250);
      await sleep(500);
    } finally {
      await worker.onModuleDestroy();
    }
    expect([ran, failed]).toEqual([1, 1]);
    expect(reported).toEqual([failing]);
    const beats = await monitoring.heartbeatsOf([done, failing]);
    expect([...beats.keys()]).toEqual([done]);
  }, 40_000);

  it('finds a scheduled job late until a pass finishes after its tick, as the app reads it', async () => {
    const queue = `monitoring-tick-${randomUUID().slice(0, 8)}`;
    const boss = new PgBossClient({ DATABASE_URL: urls.adminDbUrl, SERVER_ROLE: 'worker' });
    try {
      await boss.onModuleInit();
      await boss.boss.createQueue(queue);
      await boss.boss.schedule(queue, '*/5 * * * *', {});
    } finally {
      await boss.onModuleDestroy();
    }
    // Scheduled a day ago, so its ticks since are due.
    await admin.query(
      `UPDATE pgboss.schedule SET created_on = now() - interval '1 day' WHERE name = $1`,
      [queue],
    );
    const check = new JobsCheck(monitoring, () => new Date());

    expect((await check.report()).overdue).toContain(queue);
    await monitoring.recordHeartbeat(queue, new Date());
    expect((await check.report()).overdue).not.toContain(queue);

    // The archive is off on a test database: no backups are expected, and reading its state works as the app.
    expect((await monitoring.archive()).mode).toBe('off');
    expect((await check.report()).overdue.filter((name) => name.startsWith('backup:'))).toEqual([]);
  }, 40_000);

  it('counts the shops in a paid period and their plans’ revenue a month (DAT-55)', async () => {
    const before = await monitoring.capacityFigures();
    // A plan sold for 3 months at 1,500 TK: 500 TK a month.
    const term = await admin.query<{ id: string }>(
      `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
       VALUES ('৩ মাস', '3 months', 3, false, 99) RETURNING id`,
    );
    const plan = await admin.query<{ id: string }>(
      'SELECT id FROM control.plans ORDER BY created_at LIMIT 1',
    );
    const termId = term.rows[0]?.id;
    const planId = plan.rows[0]?.id;
    await admin.query(
      'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, 1500)',
      [planId, termId],
    );
    const tag = randomUUID().slice(0, 8);
    const paying = await seedShop(admin, 'Paying shop', `cap-paying-${tag}`);
    await admin.query(
      'UPDATE control.tenants SET plan_id = $2, billing_term_id = $3 WHERE id = $1',
      [paying, planId, termId],
    );
    // Given its plan by the operator, with no term: paying, but adds no revenue.
    await seedShop(admin, 'Assigned shop', `cap-assigned-${tag}`);
    // Neither a trial nor a lapsed shop pays.
    await seedShop(admin, 'Trial shop', `cap-trial-${tag}`, 'trial');
    await seedShop(admin, 'Lapsed shop', `cap-grace-${tag}`, 'grace');

    const after = await monitoring.capacityFigures();
    expect(after.payingShops - before.payingShops).toBe(2);
    expect(after.monthlyRevenue - before.monthlyRevenue).toBeCloseTo(500, 2);
  });
});

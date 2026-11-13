import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LeaseRepository,
  LimitEventRepository,
  ServiceStateRepository,
  TransactionRunner,
  type PreparedDatabase,
} from '@lytronix/db';
import { EnvironmentParser } from '../src/config/env';
import { DrizzleLimitsDatabase } from '../src/database/adapters/limits.adapter';
import { DatabaseService } from '../src/database/database.service';
import { ExactLimits } from '../src/modules/shared/limits/services/exact-limits';
import { Leases } from '../src/modules/shared/limits/services/leases';
import { RedisLimitStore } from '../src/modules/shared/limits/services/redis-limit-store';
import { PgBossClient } from '../src/modules/shared/queue/services/pg-boss-client';
import { prepareTestDatabase } from './support/database';

// D9-15, RED-02, RED-03, RED-05, RED-11, MON-04 (Slice 9.4): what every API copy and server share, each "server" here
// its own connection pool. The exact limits allow exactly the limit together; a lease has one holder at a time and
// lapses by itself; an outage is told once; two job workers never run a scheduled pass at once. With a Redis
// (REDIS_TEST_URL, CI's verify job), two processes' Redis windows count together.
const ADMIN = process.env['DATABASE_TEST_ADMIN_URL'];
const REDIS_URL = process.env['REDIS_TEST_URL'];
const DB_NAME = 'lytronix_limits_test';
const describeIfDatabase = ADMIN ? describe : describe.skip;
const describeIfRedis = ADMIN && REDIS_URL ? describe : describe.skip;
const MINUTE_MS = 60_000;

interface Server {
  database: DatabaseService;
  limits: DrizzleLimitsDatabase;
}

function serverOn(url: string): Server {
  const database = new DatabaseService(
    new EnvironmentParser().parse({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url,
      OTP_SECRET: 'limits-e2e-otp-secret-0123456789abcdef',
    }),
  );
  const limits = new DrizzleLimitsDatabase(
    database,
    new TransactionRunner(),
    new LimitEventRepository(),
    new LeaseRepository(),
    new ServiceStateRepository(),
  );
  return { database, limits };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let urls: PreparedDatabase;
let one: Server;
let two: Server;
// Set once the database and both servers are up, so a setup that timed out closes nothing.
let ready = false;

beforeAll(async () => {
  if (!ADMIN) return;
  urls = await prepareTestDatabase(ADMIN, DB_NAME);
  one = serverOn(urls.appDbUrl);
  two = serverOn(urls.appDbUrl);
  ready = true;
  // Migrating a fresh database takes a while when many suites run at once.
}, 180_000);

afterAll(async () => {
  if (!ready) return;
  await one.database.onApplicationShutdown();
  await two.database.onApplicationShutdown();
});

describeIfDatabase('exact limits, leases and a shared outage (Slice 9.4)', () => {
  it('lets two servers together through exactly the limit, at once (RED-11)', async () => {
    const first = new ExactLimits(one.limits);
    const second = new ExactLimits(two.limits);
    const bucket = `order-shop:${randomUUID()}`;
    const answers = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        (index % 2 === 0 ? first : second).take(bucket, 10, MINUTE_MS, new Date()),
      ),
    );
    expect(answers.filter((answer) => answer.allowed).length).toBe(10);
    // A look counts nothing.
    const look = await first.peek(bucket, 10, MINUTE_MS, new Date());
    expect(look.allowed).toBe(false);
    expect(look.resetMs).toBeGreaterThan(0);
  });

  it('counts nothing for a request whose transaction rolled back (a payment session with its order)', async () => {
    const exact = new ExactLimits(one.limits);
    const bucket = `session-shop:${randomUUID()}`;
    await expect(
      new TransactionRunner().run(one.database.handle.db, async (tx) => {
        await exact.take(bucket, 1, MINUTE_MS, new Date(), tx);
        throw new Error('the order failed');
      }),
    ).rejects.toThrow('the order failed');
    expect((await exact.take(bucket, 1, MINUTE_MS, new Date())).allowed).toBe(true);
  });

  it('gives a lease one holder at a time, lets a lapsed one go, and makes "once" once (§107, §119)', async () => {
    const first = new Leases(one.limits);
    const second = new Leases(two.limits);
    const key = `checkout:${randomUUID()}`;
    expect(await first.acquire(key, MINUTE_MS, new Date())).toBe(true);
    expect(await second.acquire(key, MINUTE_MS, new Date())).toBe(false);
    expect(await first.acquire(key, MINUTE_MS, new Date())).toBe(true);
    await first.release(key);
    expect(await second.acquire(key, MINUTE_MS, new Date())).toBe(true);

    const lapsing = `token:${randomUUID()}`;
    expect(await first.acquire(lapsing, 50, new Date())).toBe(true);
    await sleep(120);
    expect(await second.acquire(lapsing, MINUTE_MS, new Date())).toBe(true);

    const notice = `fee-short:${randomUUID()}`;
    expect(await first.once(notice, MINUTE_MS, new Date())).toBe(true);
    expect(await first.once(notice, MINUTE_MS, new Date())).toBe(false);
    expect(await second.once(notice, MINUTE_MS, new Date())).toBe(false);
  });

  it("runs a second process's work after the first's, never beside it (a payment's second tap)", async () => {
    const key = `checkout:${randomUUID()}`;
    const order: string[] = [];
    let running = 0;
    let most = 0;
    const work = (name: string) => async () => {
      running += 1;
      most = Math.max(most, running);
      order.push(`${name} starts`);
      await sleep(400);
      order.push(`${name} ends`);
      running -= 1;
      return name;
    };
    const [a, b] = await Promise.all([
      new Leases(one.limits).inTurn(key, 5_000, 5_000, work('a')),
      (async () => {
        await sleep(50);
        return new Leases(two.limits).inTurn(key, 5_000, 5_000, work('b'));
      })(),
    ]);
    expect(a).toEqual({ held: true, value: 'a' });
    expect(b).toEqual({ held: true, value: 'b' });
    expect(most).toBe(1);
    expect(order).toEqual(['a starts', 'a ends', 'b starts', 'b ends']);
  });

  it('tells of an outage once and of its end once, however many servers notice (RED-05)', async () => {
    const service = `redis-${randomUUID().slice(0, 8)}`;
    const now = new Date();
    const downs = await Promise.all([
      one.limits.markDown(service, now),
      two.limits.markDown(service, now),
    ]);
    expect(downs.filter(Boolean)).toHaveLength(1);
    expect(await one.limits.markDown(service, now)).toBe(false);
    const ups = await Promise.all([
      one.limits.markUp(service, now),
      two.limits.markUp(service, now),
    ]);
    expect(ups.filter((since) => since !== null)).toHaveLength(1);
  });

  it('never runs a scheduled pass on two workers at once (MON-04)', async () => {
    const queue = `limits-test-pass-${randomUUID().slice(0, 8)}`;
    const workers = [one, two].map(
      (server) =>
        new PgBossClient(
          { DATABASE_URL: urls.appDbUrl, SERVER_ROLE: 'worker' },
          new Leases(server.limits),
        ),
    );
    let running = 0;
    let most = 0;
    let runs = 0;
    try {
      for (const worker of workers) await worker.onModuleInit();
      await workers[0]?.boss.createQueue(queue);
      for (const worker of workers) {
        await worker.workOnce(queue, async () => {
          runs += 1;
          running += 1;
          most = Math.max(most, running);
          await sleep(2_500);
          running -= 1;
        });
      }
      await workers[0]?.boss.send(queue, {});
      await workers[1]?.boss.send(queue, {});
      for (let waited = 0; waited < 12_000 && runs === 0; waited += 250) await sleep(250);
      await sleep(5_000);
    } finally {
      for (const worker of workers) await worker.onModuleDestroy();
    }
    expect(runs).toBeGreaterThan(0);
    expect(most).toBe(1);
  }, 40_000);
});

describeIfRedis('the shared Redis (Slice 9.4, RED-02, RED-03)', () => {
  const clients: Redis[] = [];

  afterAll(async () => {
    for (const client of clients) await client.quit();
  });

  function storeOfOwnProcess(): RedisLimitStore {
    const client = new Redis(REDIS_URL ?? '');
    clients.push(client);
    return new RedisLimitStore(client, `lytro-test:${DB_NAME}:`);
  }

  it('counts two processes together, exactly, in a sliding window that expires', async () => {
    const [first, second] = [storeOfOwnProcess(), storeOfOwnProcess()];
    const bucket = `ip:${randomUUID()}:203.0.113.9`;
    const now = new Date();
    const answers = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        (index % 2 === 0 ? first : second).take(bucket, 10, MINUTE_MS, now),
      ),
    );
    expect(answers.filter((answer) => answer.allowed).length).toBe(10);
    const look = await second.peek(bucket, 10, MINUTE_MS, now);
    expect(look).toEqual({ allowed: false, remaining: 0, resetMs: MINUTE_MS });
    // A minute on, the window is empty again.
    const later = await first.take(bucket, 10, MINUTE_MS, new Date(now.getTime() + MINUTE_MS + 1));
    expect(later.allowed).toBe(true);
    const ttl = await clients[0]?.pttl(`lytro-test:${DB_NAME}:${bucket}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(MINUTE_MS);
  });
});

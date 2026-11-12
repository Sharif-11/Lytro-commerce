import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareTestDatabase } from './support/database';
import { getJson } from './support/http';

// D9-11: one image, two roles. An API process answers HTTP and starts no background work, so two of them can be replaced
// one at a time behind Caddy; the worker process runs every job. AppModule decides its imports when its file loads, so
// each case sets SERVER_ROLE and loads a fresh copy of the server's code.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_server_roles_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
// Booting the whole server (and, for the worker, creating every queue) takes several seconds on a busy machine.
const BOOT_MS = 60_000;

let app: INestApplication | undefined;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'server-roles-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  delete process.env['SERVER_ROLE'];
});

async function boot(role: 'api' | 'worker') {
  process.env['SERVER_ROLE'] = role;
  vi.resetModules();
  // Every Nest class must come from the same fresh copy, the boot helper's HttpSetup included.
  const { listenOn } = await import('./support/bootstrap');
  const { AppModule } = await import('../src/app/app.module');
  const { PgBossClient } = await import('../src/modules/shared/queue/services/pg-boss-client');
  const { LifecycleTickWorker } =
    await import('../src/modules/shared/queue-workers/services/lifecycle-tick-worker');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const started = await listenOn(moduleRef);
  app = started.app;
  // Whether the queue started is the client's own private record of it.
  const queueStarted =
    Reflect.get(moduleRef.get(PgBossClient, { strict: false }), 'started') === true;
  let hasWorkers = true;
  try {
    moduleRef.get(LifecycleTickWorker, { strict: false });
  } catch {
    hasWorkers = false;
  }
  const health = (await getJson(started.port, '/health')).body as { role: string };
  return { queueStarted, hasWorkers, role: health.role };
}

describeIfDatabase('server roles (D9-11)', () => {
  it(
    'an API process answers HTTP but registers no job worker and leaves the job queue stopped',
    async () => {
      const api = await boot('api');

      expect(api).toEqual({ queueStarted: false, hasWorkers: false, role: 'api' });
    },
    BOOT_MS,
  );

  it(
    'the worker process registers every job worker and starts the job queue',
    async () => {
      const worker = await boot('worker');

      expect(worker).toEqual({ queueStarted: true, hasWorkers: true, role: 'worker' });
    },
    BOOT_MS,
  );
});

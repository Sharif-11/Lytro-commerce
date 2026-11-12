import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import type { ExecutionContext } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryRepository,
  ComboRepository,
  DatabaseProbe,
  PublicCatalogueRepository,
  TransactionRunner,
  type PreparedDatabase,
} from '@lytronix/db';
import { ApiError } from '../src/common/api-error';
import { SavingGuard } from '../src/common/guards/saving.guard';
import { EnvironmentParser } from '../src/config/env';
import { DrizzlePublicCatalogueStore } from '../src/database/adapters/public-catalogue.adapter';
import { DatabaseService } from '../src/database/database.service';
import { PrimaryWatch } from '../src/database/primary-watch';
import { ReadyController } from '../src/modules/health/ready.controller';
import { prepareTestDatabase, seedShop } from './support/database';

// Phase 9 exit criterion 5 (Slice 9.2, DAT-41 to DAT-47): with a real primary and a standby streaming from it
// (.github/scripts/standby/start.sh, CI's `standby` job), reads go to the standby, a write never lands there, and
// stopping the primary gives "can't save": writes refused with a retry hint while reads go on. A caller's reads kept on
// the primary just after it writes waits for Slice 9.4's Redis marker (PHASE-9-PLAN §3.4); the failover command is 9.3's.
const PRIMARY_ADMIN = process.env['STANDBY_PRIMARY_ADMIN_URL'];
const STANDBY_PORT = process.env['STANDBY_PORT'] ?? '5442';
const DB_NAME = 'lytronix_standby_test';
const describeIfStandby = PRIMARY_ADMIN ? describe : describe.skip;

function onStandby(url: string): string {
  const parsed = new URL(url);
  parsed.port = STANDBY_PORT;
  return parsed.toString();
}

function serviceOver(writeUrl: string, readUrl: string): DatabaseService {
  return new DatabaseService(
    new EnvironmentParser().parse({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: writeUrl,
      DATABASE_READ_URL: readUrl,
      OTP_SECRET: 'standby-e2e-otp-secret-0123456789abcdef',
    }),
  );
}

function storeOver(database: DatabaseService): DrizzlePublicCatalogueStore {
  const transactions = new TransactionRunner();
  return new DrizzlePublicCatalogueStore(
    database,
    transactions,
    new PublicCatalogueRepository(transactions),
    new CategoryRepository(transactions),
    new ComboRepository(transactions),
  );
}

const request = (method: string): ExecutionContext =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  }) as unknown as ExecutionContext;

async function readyStatus(watch: PrimaryWatch): Promise<number> {
  let status = 200;
  await new ReadyController(watch).ready({ status: (code: number) => (status = code) });
  return status;
}

/** Waits until the standby has replayed what the check looks for. */
async function untilReplayed(check: () => Promise<boolean>): Promise<void> {
  for (let waited = 0; waited < 30_000; waited += 250) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('the standby never replayed it');
}

const probe = new DatabaseProbe();
let urls: PreparedDatabase;
let standbyAdmin: pg.Client;
let shopId: string;
const services: DatabaseService[] = [];

beforeAll(async () => {
  if (!PRIMARY_ADMIN) return;
  urls = await prepareTestDatabase(PRIMARY_ADMIN, DB_NAME);
  const primaryAdmin = new pg.Client({ connectionString: urls.adminDbUrl });
  await primaryAdmin.connect();
  shopId = await seedShop(primaryAdmin, 'Standby Shop', 'standby-shop');
  await primaryAdmin.end();

  // The test database reaches the standby a moment after the primary makes it: a fresh client each try until it's there.
  let connected: pg.Client | undefined;
  await untilReplayed(async () => {
    const client = new pg.Client({ connectionString: onStandby(urls.adminDbUrl) });
    try {
      await client.connect();
      const found = await client.query('SELECT 1 FROM control.tenants WHERE id = $1', [shopId]);
      if (found.rowCount === 1) {
        connected = client;
        return true;
      }
    } catch {
      // Not replayed yet.
    }
    await client.end().catch(() => undefined);
    return false;
  });
  if (!connected) throw new Error('no standby connection');
  standbyAdmin = connected;
}, 60_000);

afterAll(async () => {
  if (!PRIMARY_ADMIN) return;
  for (const service of services) await service.onApplicationShutdown();
  await standbyAdmin.end();
});

describeIfStandby('a primary and a streaming standby (exit criterion 5)', () => {
  it('reads go to the standby, writes to the primary, and a write shows on the standby once replayed', async () => {
    const database = serviceOver(urls.appDbUrl, onStandby(urls.readDbUrl));
    services.push(database);
    expect(await probe.serving(database.handle.db)).toBe('primary');
    expect(await probe.serving(database.reads.db)).toBe('standby');
    const store = storeOver(database);
    await expect(store.run((tx) => store.listCategories(tx, shopId))).resolves.toEqual([]);

    const writer = new pg.Client({ connectionString: urls.appDbUrl });
    await writer.connect();
    try {
      await writer.query('BEGIN');
      await writer.query(`SELECT set_config('app.tenant_id', $1, true)`, [shopId]);
      await writer.query(
        `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary)
         VALUES ($1, 'user', NULL, 'role_created', 'success', '{"name":"Standby"}')`,
        [shopId],
      );
      await writer.query('COMMIT');
    } finally {
      await writer.end();
    }
    await untilReplayed(async () => {
      const seen = await standbyAdmin.query(
        'SELECT 1 FROM tenant.activity_log WHERE tenant_id = $1',
        [shopId],
      );
      return seen.rowCount === 1;
    });
  });

  it('a write pool pointed at the standby fails the ready check, and nothing can be written there', async () => {
    const misplaced = serviceOver(onStandby(urls.appDbUrl), onStandby(urls.readDbUrl));
    services.push(misplaced);
    const watch = new PrimaryWatch(misplaced, probe);
    expect(await watch.check()).toEqual({ writes: 'standby', reads: 'up' });
    expect(watch.canSave()).toBe(false);
    expect(await readyStatus(watch)).toBe(503);
    expect(() => new SavingGuard(watch).canActivate(request('POST'))).toThrow(ApiError);

    const writer = new pg.Client({ connectionString: onStandby(urls.appDbUrl) });
    await writer.connect();
    try {
      await expect(
        writer.query(
          `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary)
           VALUES ($1, 'user', NULL, 'role_created', 'success', '{}')`,
          [shopId],
        ),
      ).rejects.toMatchObject({ code: '25006' });
    } finally {
      await writer.end();
    }
  });

  it('with the primary stopped, writes are refused with a retry hint and reads go on from the standby', async () => {
    const database = serviceOver(urls.appDbUrl, onStandby(urls.readDbUrl));
    services.push(database);
    const watch = new PrimaryWatch(database, probe);
    expect(await watch.check()).toEqual({ writes: 'primary', reads: 'up' });

    execFileSync('docker', ['stop', '--time', '1', 'pg-primary']);

    expect(await watch.check()).toEqual({ writes: 'unreachable', reads: 'up' });
    expect(await readyStatus(watch)).toBe(200);
    const guard = new SavingGuard(watch);
    expect(guard.canActivate(request('GET'))).toBe(true);
    const refusal: unknown = (() => {
      try {
        return guard.canActivate(request('POST'));
      } catch (error) {
        return error;
      }
    })();
    expect(refusal).toBeInstanceOf(ApiError);
    expect(refusal).toMatchObject({ code: 'service_unavailable', retryAfterSeconds: 30 });
    const store = storeOver(database);
    await expect(store.run((tx) => store.listCategories(tx, shopId))).resolves.toEqual([]);
  });
});

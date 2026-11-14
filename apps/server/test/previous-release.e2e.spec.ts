import 'dotenv/config';
import { execFileSync, spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listTenantRoutes } from './isolation/inventory';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { EveryKind, type Caller } from './support/every-kind';
import { MemoryStorage } from './support/memory-storage';
import {
  currentSnapshot,
  newValues,
  readSnapshot,
  type ColumnValue,
} from './support/schema-values';
import { SmsCapture } from './support/sms-capture';

// Phase 9 Slice 9.7 (ENGINEERING-STANDARDS §5, recipe 6): the release before this one runs beside it while it deploys,
// and is what a rollback goes back to, so it must read what this release's schema can hold. This branch migrates a
// database, fills a shop through its own code, and puts each value its schema allows that the previous release's did
// not into a row of that shop. Then the previous release's server image, in a container, answers every dashboard route
// that reads, and none may fail: a value written by the release that adds it shows up here as a 500.
//
// CI's previous-release job runs it when a migration changed, with main's image and main's newest drizzle-kit snapshot.
const ADMIN = process.env['DATABASE_TEST_ADMIN_URL'];
const IMAGE = process.env['PREVIOUS_SERVER_IMAGE'];
const SNAPSHOT = process.env['PREVIOUS_SCHEMA_SNAPSHOT'];
const describeIfPrevious = ADMIN && IMAGE && SNAPSHOT ? describe : describe.skip;
const DB_NAME = 'lytronix_previous_release_test';
const PREVIOUS_PORT = 3987;
const CONTAINER = `lytro-previous-release-${String(process.pid)}`;
vi.setConfig({ hookTimeout: 300_000, testTimeout: 180_000 });

// Both servers read and seal with these, so the previous release opens what this one stored.
const SETTINGS = {
  OTP_SECRET: 'previous-release-e2e-otp-secret-0123456789',
  PLATFORM_DOMAIN: 'localhost',
  STOREFRONT_SECRET: 'previous-release-e2e-storefront-secret-0123456789',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

/** A route parameter that is a name, not an ID: the value every seeded shop has for it. */
const NAMED_VALUES: Readonly<Record<string, string>> = { key: 'steadfast', method: 'bkash' };

let app: INestApplication | undefined;
let admin: pg.Client;
let shop: Caller;
/** The reads to make, with their IDs filled in from the seeded shop, and any the walk couldn't fill. */
const reads: { route: string; path: string }[] = [];
const problems: string[] = [];
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN || !IMAGE || !SNAPSHOT) return;
  const urls = await prepareTestDatabase(ADMIN, DB_NAME);
  Object.assign(process.env, SETTINGS, { DATABASE_URL: urls.appDbUrl });
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const storage = new MemoryStorage();
  const moduleRef = await Test.createTestingModule({ imports: [DiscoveryModule, AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .compile();
  const started = await listenOn(moduleRef);
  app = started.app;
  const kinds = new EveryKind(started.port, admin, texts, storage, SETTINGS.STOREFRONT_SECRET);
  shop = await kinds.caller('prevrel');
  await kinds.seed(shop);
  await planReads(app, kinds);
  // This release stops before the previous one starts, so nothing of its own moves the rows being read.
  await app.close();
  app = undefined;

  for (const value of newValues(readSnapshot(SNAPSHOT), currentSnapshot())) {
    const problem = await place(value, shop.shop.tenantId);
    if (problem) problems.push(problem);
  }
  startPrevious(urls.appDbUrl);
  await untilHealthy();
});

afterAll(async () => {
  if (!ADMIN || !IMAGE || !SNAPSHOT) return;
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
  await app?.close();
  await admin.end();
  for (const name of Object.keys(SETTINGS)) Reflect.deleteProperty(process.env, name);
});

/** Every dashboard route that reads, its IDs the seeded shop's first rows: the routes the previous release may lack 404. */
async function planReads(running: INestApplication, kinds: EveryKind): Promise<void> {
  const routes = listTenantRoutes(running).filter(
    // The storefront's reads name their shop by host, and the walk calls as the shop's owner.
    (route) => route.startsWith('GET ') && !route.includes(' /public/'),
  );
  for (const route of routes) {
    const path = route.slice('GET '.length);
    let filled = path;
    let missing: string | null = null;
    for (const [match, name = ''] of path.matchAll(/:([A-Za-z]+)/g)) {
      const named = NAMED_VALUES[name];
      const upTo = path.slice(0, path.indexOf(match) + match.length);
      const ids = named ? [named] : await kinds.idsFor(upTo, shop.shop.tenantId, 1);
      if (typeof ids === 'string') missing = ids;
      else filled = filled.replace(match, ids[0] ?? '');
    }
    if (missing) problems.push(`${route}: ${missing}`);
    else reads.push({ route, path: filled });
  }
}

/**
 * Puts a value the previous release never saw into one row: the shop's own where the table is a shop's, any otherwise.
 * Triggers are off for the change (a paid invoice refuses edits), so only the value's own rules apply.
 */
async function place(value: ColumnValue, tenantId: string): Promise<string | null> {
  const [schema = '', table = ''] = value.table.split('.');
  const target = `"${schema}"."${table}"`;
  const { rows } = await admin.query<{ shops: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = 'tenant_id') AS shops`,
    [schema, table],
  );
  const which = rows[0]?.shops ? `WHERE tenant_id = '${tenantId}'` : '';
  await admin.query('BEGIN');
  try {
    await admin.query("SET LOCAL session_replication_role = 'replica'");
    const changed = await admin.query(
      `UPDATE ${target} SET "${value.column}" = $1
       WHERE ctid = (SELECT ctid FROM ${target} ${which} LIMIT 1)`,
      [value.value],
    );
    await admin.query('COMMIT');
    return changed.rowCount === 1
      ? null
      : `${value.table} has no row to hold ${value.column} = '${value.value}': seed one (test/support/every-kind.ts)`;
  } catch (error) {
    await admin.query('ROLLBACK');
    return `${value.table}.${value.column} = '${value.value}' could not be placed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** The previous release's server, as its image runs it: the API alone, so no timed job moves the rows it reads. */
function startPrevious(databaseUrl: string): void {
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
  // On Linux (CI) the container shares the machine's network; elsewhere it reaches the database by Docker's host name.
  const linux = process.platform === 'linux';
  const url = new URL(databaseUrl);
  if (!linux) url.hostname = 'host.docker.internal';
  const env = { ...SETTINGS, DATABASE_URL: url.toString(), PORT: String(PREVIOUS_PORT) };
  execFileSync('docker', [
    'run',
    '-d',
    '--name',
    CONTAINER,
    ...(linux
      ? ['--network', 'host']
      : ['-p', `${String(PREVIOUS_PORT)}:${String(PREVIOUS_PORT)}`]),
    // Started as main.ts starts it, which test mode isn't (it leaves out the process's shutdown handling).
    ...Object.entries({ ...env, NODE_ENV: 'development', SERVER_ROLE: 'api' }).flatMap(
      ([name, value]) => ['-e', `${name}=${value}`],
    ),
    IMAGE ?? '',
  ]);
}

function logsOfPrevious(): string {
  const logs = spawnSync('docker', ['logs', '--tail', '40', CONTAINER], { encoding: 'utf8' });
  return `${logs.stdout}${logs.stderr}`;
}

async function untilHealthy(): Promise<void> {
  for (let tries = 0; tries < 90; tries += 1) {
    const answer = await get('/health', {}).catch(() => null);
    if (answer?.status === 200) return;
    const running = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], {
      encoding: 'utf8',
    }).stdout.trim();
    if (running !== 'true') throw new Error(`the previous release stopped:\n${logsOfPrevious()}`);
    await new Promise((resolve) => {
      setTimeout(resolve, 1_000);
    });
  }
  throw new Error(`the previous release never answered /health:\n${logsOfPrevious()}`);
}

function get(
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: '127.0.0.1', port: PREVIOUS_PORT, path, method: 'GET', headers },
      (response) => {
        let text = '';
        response.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, text });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

describeIfPrevious('the previous release reads this schema (ENGINEERING-STANDARDS §5)', () => {
  it('answers every dashboard read without a fault, every value new since it in the rows it reads', async () => {
    const faults: string[] = [];
    for (const read of reads) {
      const answer = await get(`/api/v1${read.path}`, shop.shop.headers());
      if (answer.status >= 500)
        faults.push(`${read.route}: ${String(answer.status)} ${answer.text.slice(0, 200)}`);
    }
    if (faults.length > 0) console.error(logsOfPrevious());
    expect([...problems, ...faults]).toEqual([]);
    // 93 dashboard reads when this was written (2026-11-14).
    expect(reads.length).toBeGreaterThan(80);
  });
});

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, seedBalance, seedShop } from './support/database';
import { seedOrderFor } from './support/orders';

// Phase 9 Slice 9.3 (D9-18, D9-19, DAT-22, DAT-26, DAT-34, BKP-01, BKP-03): the backups and restores, run as the
// servers run them, from the database image (deploy/database), against a primary that archives its write-ahead log to a
// test S3 store (.github/scripts/backups/start.sh, CI's `backups` job), on the real schema. A night's backups; the dump
// restored and every table counted against the counts taken in its own snapshot; the archive restored to a minute; and
// one shop's missing rows brought back without touching another shop or counting anything twice.
const ADMIN = process.env['BACKUP_TEST_ADMIN_URL'];
const DIR = process.env['BACKUP_TEST_DIR'] ?? '/tmp/lytro-backups';
const IMAGE = process.env['BACKUP_TEST_IMAGE'] ?? 'lytro-database:ci';
const NETWORK = 'backups-net';
const PRIMARY = 'pg-backups';
const DATA_VOLUME = 'pgdata-backups';
const DB_NAME = 'lytronix_backup_test';
const describeIfBackups = ADMIN ? describe : describe.skip;
const LONG = 300_000;

interface Run {
  status: number;
  out: string;
}

function docker(args: readonly string[]): Run {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

/** A command from the database image, on the test network, with the backup settings a server's backup.env holds. */
function inImage(command: readonly string[], extra: readonly string[] = []): Run {
  return docker([
    'run',
    '--rm',
    '--network',
    NETWORK,
    '--env-file',
    join(DIR, 'test.env'),
    '-e',
    `PGDATABASE=${DB_NAME}`,
    '-e',
    `RESTORE_DB_NAME=${DB_NAME}`,
    ...extra,
    IMAGE,
    ...command,
  ]);
}

/** A shell inside the image, for what needs the restored copy running beside it. */
function shellInImage(script: string, extra: readonly string[] = []): Run {
  return inImage(['bash', '-c', script], extra);
}

describeIfBackups('backups and restores (Slice 9.3)', () => {
  let admin: pg.Client;
  const shopA = { id: '', orders: [] as string[] };
  const shopB = { id: '', orders: [] as string[] };
  const intoUrl = `postgres://postgres:ci_only_password@${PRIMARY}:5432/${DB_NAME}`;

  async function archived(): Promise<void> {
    await admin.query('SELECT pg_switch_wal()');
    const wanted = (
      await admin.query<{ w: string }>('SELECT pg_walfile_name(pg_current_wal_lsn()) AS w')
    ).rows[0]?.w;
    for (let waited = 0; waited < 60_000; waited += 500) {
      const row = (
        await admin.query<{ last: string | null }>(
          'SELECT last_archived_wal AS last FROM pg_stat_archiver',
        )
      ).rows[0];
      if (row?.last && wanted && row.last >= wanted.slice(0, 24)) return;
      await admin.query('SELECT pg_switch_wal()');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('the write-ahead log was never archived');
  }

  /** The database's clock now, as a restore's target time (ISO 8601 with its zone). */
  async function now(): Promise<string> {
    const row = (
      await admin.query<{ t: string }>(
        `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') AS t`,
      )
    ).rows[0];
    if (!row) throw new Error('no time from the database');
    return row.t;
  }

  async function orderIds(tenantId: string): Promise<string[]> {
    const rows = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.orders WHERE tenant_id = $1 ORDER BY id',
      [tenantId],
    );
    return rows.rows.map((row) => row.id);
  }

  async function fingerprint(tenantId: string): Promise<string> {
    const rows = await admin.query<{ f: string }>(
      `SELECT md5(coalesce((SELECT string_agg(o::text, '' ORDER BY o.id) FROM tenant.orders o WHERE tenant_id = $1), '')
               || coalesce((SELECT string_agg(l::text, '' ORDER BY l.id) FROM tenant.order_lines l WHERE tenant_id = $1), '')
               || (SELECT balance_amount::text FROM control.tenants WHERE id = $1)) AS f`,
      [tenantId],
    );
    return rows.rows[0]?.f ?? '';
  }

  beforeAll(async () => {
    const prepared = await prepareTestDatabase(ADMIN ?? '', DB_NAME);
    admin = new pg.Client({ connectionString: prepared.adminDbUrl });
    await admin.connect();
    shopA.id = await seedShop(admin, 'Backup shop A', `backup-a-${randomUUID().slice(0, 8)}`);
    shopB.id = await seedShop(admin, 'Backup shop B', `backup-b-${randomUUID().slice(0, 8)}`);
    await seedBalance(admin, shopA.id, '500');
    for (const [shop, count] of [
      [shopA, 40],
      [shopB, 10],
    ] as const) {
      for (let index = 0; index < count; index += 1) {
        const id = randomUUID();
        await seedOrderFor(admin, shop.id, id, [randomUUID(), randomUUID()]);
        shop.orders.push(id);
      }
    }
    await archived();
  }, LONG);

  afterAll(async () => {
    docker(['rm', '-f', 'pitr-src']);
    await admin.end();
  });

  it(
    'takes a night’s backups, and the dump restores with every table’s rows as its snapshot counted them',
    async () => {
      const night = docker([
        'run',
        '--rm',
        '--network',
        NETWORK,
        '--env-file',
        join(DIR, 'test.env'),
        '-e',
        `PGHOST=${PRIMARY}`,
        '-e',
        `PGDATABASE=${DB_NAME}`,
        '-u',
        'postgres',
        '-v',
        `${DATA_VOLUME}:/var/lib/postgresql/data:ro`,
        IMAGE,
        'lytro-nightly',
      ]);
      expect(night.status, night.out).toBe(0);
      expect(night.out).toMatch(/uploaded nightly\/\d{4}\/\d{2}\/\d{8}T\d{6}Z\.dump\.age/);
      expect(night.out).toMatch(/made base_/);
      // OBS-02, DAT-27 (Slice 9.6): each backup's heartbeat, for the jobs' check.
      const beats = await admin.query<{ name: string }>(
        `SELECT name FROM control.job_heartbeats WHERE name LIKE 'backup:%' AND finished_at > now() - interval '1 hour' ORDER BY name`,
      );
      expect(beats.rows.map((row) => row.name)).toEqual(['backup:base', 'backup:dump']);

      const drill = inImage(
        ['lytro-restore-dump', 'latest'],
        ['-v', `${join(DIR, 'age.key')}:/keys/dump.key:ro`],
      );
      expect(drill.status, drill.out).toBe(0);
      expect(drill.out).toContain('- Differences: none');
      const tables = /Tables: (\d+) in the dump, (\d+) restored/.exec(drill.out);
      expect(Number(tables?.[1])).toBeGreaterThan(100);
      expect(tables?.[2]).toBe(tables?.[1]);
    },
    LONG,
  );

  it(
    'restores the archive to a minute: what came before it is there, what came after is not',
    async () => {
      const before = randomUUID();
      const after = randomUUID();
      await seedOrderFor(admin, shopB.id, before, []);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const moment = await now();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await seedOrderFor(admin, shopB.id, after, []);
      await archived();

      const restored = shellInImage(
        `lytro-restore-pitr --to '${moment}' --serve > /tmp/o 2>&1 &
       for _ in $(seq 1 240); do grep -q 'serving the restored copy' /tmp/o && break; sleep 1; done
       grep -E '^- ' /tmp/o
       psql -X -At -h /var/run/postgresql -U postgres -d ${DB_NAME} -c "SELECT count(*) FILTER (WHERE id = '${before}') || '|' || count(*) FILTER (WHERE id = '${after}') FROM tenant.orders"`,
      );
      expect(restored.status, restored.out).toBe(0);
      expect(restored.out).toContain(`- Target: ${moment}`);
      expect(restored.out.trim().split('\n').at(-1)).toBe('1|0');
    },
    LONG,
  );

  it(
    'brings back one shop’s missing rows only: a clash skipped, a newer row kept, no other shop touched',
    async () => {
      const backupMoment = await now();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const beforeA = await orderIds(shopA.id);
      const balanceA = (
        await admin.query<{ b: string }>(
          'SELECT balance_amount AS b FROM control.tenants WHERE id = $1',
          [shopA.id],
        )
      ).rows[0]?.b;

      // The damage: fifteen of shop A's orders (and their lines) gone; a new order of shop B's takes one of their tracking
      // IDs (unique across shops: that order can't come back, nor can its lines); and shop A takes a new order.
      const gone = beforeA.slice(0, 15);
      const clash = (
        await admin.query<{ t: string }>(
          'SELECT tracking_id AS t FROM tenant.orders WHERE id = $1',
          [gone[0]],
        )
      ).rows[0]?.t;
      await admin.query('DELETE FROM tenant.orders WHERE id = ANY($1::uuid[])', [gone]);
      const clashing = randomUUID();
      await admin.query(
        `INSERT INTO tenant.orders (id, tenant_id, order_number, tracking_id, fulfilment_type, table_ref,
         subtotal, delivery_charge, grand_total, cod_amount, due)
       VALUES ($1, $2, $3, $4, 'dine_in', 'T1', 0, 0, 0, 0, 0)`,
        [clashing, shopB.id, `C-${clashing.slice(0, 8)}`, clash],
      );
      const newer = randomUUID();
      await seedOrderFor(admin, shopA.id, newer, [randomUUID()]);
      const printB = await fingerprint(shopB.id);
      await archived();

      expect(docker(['rm', '-f', 'pitr-src']).status).toBe(0);
      const started = docker([
        'run',
        '-d',
        '--name',
        'pitr-src',
        '--network',
        NETWORK,
        '--env-file',
        join(DIR, 'test.env'),
        '-e',
        `RESTORE_DB_NAME=${DB_NAME}`,
        IMAGE,
        'lytro-restore-pitr',
        '--to',
        backupMoment,
        '--serve',
      ]);
      expect(started.status, started.out).toBe(0);
      let source = '';
      for (let waited = 0; waited < 240_000 && !source; waited += 1000) {
        const logs = docker(['logs', 'pitr-src']).out;
        source = (/postgres:\/\/\S+/.exec(logs)?.[0] ?? '').replace(
          /@[^:/]+:5432/,
          '@pitr-src:5432',
        );
        if (!source) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      expect(source, docker(['logs', 'pitr-src']).out).not.toBe('');
      source = source.replace(/\/[^/]+$/, `/${DB_NAME}`);
      const urls = ['-e', `RESTORE_FROM_URL=${source}`, '-e', `RESTORE_INTO_URL=${intoUrl}`];

      const dry = inImage(['lytro-restore-shop', '--shop', shopA.id], urls);
      expect(dry.status, dry.out).toBe(0);
      expect(dry.out).toContain('dry run, nothing kept');
      expect((await orderIds(shopA.id)).length).toBe(beforeA.length - 15 + 1);

      const applied = inImage(['lytro-restore-shop', '--shop', shopA.id, '--apply'], urls);
      expect(applied.status, applied.out).toBe(0);
      expect(applied.out).toContain('APPLIED');
      expect(applied.out).toMatch(/tables fingerprinted before and after, unchanged/);
      expect(applied.out).toMatch(/tenant\.orders: 15 missing, 14 added/);
      expect(applied.out).toMatch(/tenant\.order_lines: 30 missing, 28 added/);
      expect(applied.out).toMatch(/3 skipped/);

      const afterA = await orderIds(shopA.id);
      expect(afterA).toContain(newer);
      expect(afterA.filter((id) => gone.includes(id))).toHaveLength(14);
      const lines = await admin.query<{ n: string }>(
        'SELECT count(*) AS n FROM tenant.order_lines WHERE order_id = ANY($1::uuid[])',
        [gone],
      );
      expect(Number(lines.rows[0]?.n)).toBe(28);
      expect(await fingerprint(shopB.id)).toBe(printB);
      const balance = await admin.query<{ b: string }>(
        'SELECT balance_amount AS b FROM control.tenants WHERE id = $1',
        [shopA.id],
      );
      expect(balance.rows[0]?.b).toBe(balanceA);
      const left = await admin.query<{ n: string }>(
        "SELECT count(*) AS n FROM pg_namespace WHERE nspname LIKE 'lytro_restore_%'",
      );
      expect(left.rows[0]?.n).toBe('0');
    },
    LONG,
  );

  it('names only tables that exist in its never-restore list (a renamed table must not slip back in)', async () => {
    const script = readFileSync(
      join(__dirname, '../../../deploy/database/bin/lytro-restore-shop'),
      'utf8',
    );
    const list = /NEVER_RESTORE=\(([\s\S]*?)\)/.exec(script)?.[1] ?? '';
    const names = list.split(/\s+/).filter((name) => /^(control|tenant)\.[a-z_]+$/.test(name));
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      const found = await admin.query<{ r: string | null }>('SELECT to_regclass($1)::text AS r', [
        name,
      ]);
      expect(found.rows[0]?.r, name).toBe(name);
    }
  });
});

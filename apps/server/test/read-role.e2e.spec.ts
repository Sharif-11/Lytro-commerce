import 'dotenv/config';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, seedShop } from './support/database';

// Slice 9.2 (D9-13, DAT-45): the read pool connects as a role that may only SELECT, whatever the application role may
// read and nothing more, with every transaction read-only by default, and still under row-level security (DAT-03).
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_read_role_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

interface TablePrivileges {
  name: string;
  app_reads: boolean;
  reads: boolean;
  writes: boolean;
}

let admin: pg.Client;
let reader: pg.Client;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, readDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  admin = new pg.Client({ connectionString: adminDbUrl });
  reader = new pg.Client({ connectionString: readDbUrl });
  await admin.connect();
  await reader.connect();
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await reader.end();
  await admin.end();
});

describeIfDatabase('the read pool role (D9-13, DAT-45)', () => {
  it('reads every table the application role reads, and may write none', async () => {
    const { rows } = await admin.query<TablePrivileges>(`
      SELECT c.oid::regclass::text AS name,
             has_table_privilege('lytronix_app', c.oid, 'SELECT') AS app_reads,
             has_table_privilege('lytronix_read', c.oid, 'SELECT') AS reads,
             has_table_privilege('lytronix_read', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE') AS writes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm')
        AND left(n.nspname, 3) <> 'pg_' AND n.nspname NOT IN ('information_schema', 'pgboss')`);

    expect(rows.filter((table) => table.reads).length).toBeGreaterThan(50);
    expect(
      rows.filter((table) => table.app_reads && !table.reads).map((table) => table.name),
    ).toEqual([]);
    expect(
      rows.filter((table) => table.reads && !table.app_reads).map((table) => table.name),
    ).toEqual([]);
    expect(rows.filter((table) => table.writes).map((table) => table.name)).toEqual([]);
  });

  it('opens every transaction read-only, so not even a scratch table can be made', async () => {
    expect((await reader.query('SHOW default_transaction_read_only')).rows[0]).toEqual({
      default_transaction_read_only: 'on',
    });
    await expect(reader.query('CREATE TEMP TABLE scratch (id int)')).rejects.toMatchObject({
      code: '25006',
    });
    // Refused as a write in a read-only transaction, or for want of the right: either way, nothing is written.
    const refusal: unknown = await reader.query('DELETE FROM control.plans WHERE false').then(
      () => null,
      (error: unknown) => error,
    );
    expect(String(Reflect.get(Object(refusal), 'code'))).toMatch(/^(25006|42501)$/);
  });

  it('is under row-level security: a shop sees only its own rows, and none without a shop', async () => {
    const roles = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'lytronix_read'`,
    );
    expect(roles.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });

    const first = await seedShop(admin, 'Read One', 'read-role-one');
    const second = await seedShop(admin, 'Read Two', 'read-role-two');
    for (const tenantId of [first, second]) {
      await admin.query(
        `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary)
         VALUES ($1, 'user', NULL, 'role_created', 'success', '{"name":"Read"}')`,
        [tenantId],
      );
    }

    const unscoped = await reader.query('SELECT count(*)::int AS rows FROM tenant.activity_log');
    expect(unscoped.rows[0]).toEqual({ rows: 0 });

    // A read on the read pool sets the shop inside its own (read-only) transaction, as the application does.
    await reader.query('BEGIN');
    try {
      await reader.query(`SELECT set_config('app.tenant_id', $1, true)`, [first]);
      const scoped = await reader.query<{ tenant_id: string }>(
        'SELECT DISTINCT tenant_id FROM tenant.activity_log',
      );
      expect(scoped.rows).toEqual([{ tenant_id: first }]);
    } finally {
      await reader.query('ROLLBACK');
    }
  });
});

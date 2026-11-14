import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretBox, SecretPurpose } from '../src/modules/shared/secrets/secret-box';
import { SEALED_COLUMNS, SealedValuesReseal } from '../src/modules/shared/secrets/sealed-values';
import { prepareTestDatabase, seedShop } from './support/database';

// SEC-10, §81, D9-8 (Slice 9.7): after a key change, every stored value sealed with the old key is sealed again with the
// new one, as the app's own role under row-level security; what neither key opens is reported, never changed; a second
// run changes nothing. And every bytea column the database has is either listed as sealed or named here as not.
const ADMIN = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_reseal_test';
const describeIfDatabase = ADMIN ? describe : describe.skip;

/** The bytea columns that hold no sealed value. */
const NOT_SEALED = ['control.catalog_feeds.token_hash', 'tenant.data_exports.file_content'];

const oldKey = randomBytes(32);
const newKey = randomBytes(32);
const sealedBefore = new SecretBox({ current: oldKey, previous: null });
const changing = new SecretBox({ current: newKey, previous: oldKey });
const after = new SecretBox({ current: newKey, previous: null });

let admin: pg.Client;
let app: pg.Client;
let shopId: string;

beforeAll(async () => {
  if (!ADMIN) return;
  const urls = await prepareTestDatabase(ADMIN, DB_NAME);
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  app = new pg.Client({ connectionString: urls.appDbUrl });
  await app.connect();
  shopId = await seedShop(admin, 'Reseal shop', `reseal-${randomUUID().slice(0, 8)}`);
  await admin.query(
    `INSERT INTO tenant.courier_connections (tenant_id, courier_key, credentials, message_secrets)
     VALUES ($1, 'steadfast', $2, $3), ($1, 'pathao', $4, NULL)`,
    [
      shopId,
      sealedBefore.seal('{"apiKey":"a"}', SecretPurpose.CourierCredentials, shopId),
      sealedBefore.seal('{"route":"r","token":"t"}', SecretPurpose.CourierMessages, shopId),
      // Sealed under a key neither knows: reported, left as it is.
      new SecretBox({ current: randomBytes(32), previous: null }).seal(
        '{"apiKey":"lost"}',
        SecretPurpose.CourierCredentials,
        shopId,
      ),
    ],
  );
  await admin.query(
    `INSERT INTO control.platform_gateway_accounts (method, number, credentials, sandbox)
     VALUES ('bkash', '01700000000', $1, true)`,
    [sealedBefore.seal('{"appKey":"k"}', SecretPurpose.GatewayCredentials, 'lytro')],
  );
}, 180_000);

afterAll(async () => {
  if (!ADMIN) return;
  await app.end();
  await admin.end();
});

describeIfDatabase('sealing every stored value again after a key change (Slice 9.7)', () => {
  it('seals the old key’s values with the new one, reports what neither opens, and changes nothing a second time', async () => {
    const counts = await new SealedValuesReseal(app, changing).run();
    const of = (column: string) => counts.find((count) => count.column === column);
    expect(of('tenant.courier_connections.credentials')).toEqual({
      column: 'tenant.courier_connections.credentials',
      current: 0,
      resealed: 1,
      unreadable: [shopId],
    });
    expect(of('tenant.courier_connections.message_secrets')?.resealed).toBe(1);
    expect(of('control.platform_gateway_accounts.credentials')?.resealed).toBe(1);

    // The new key alone now opens each, bound to its owner as before.
    const connection = await admin.query<{ credentials: Buffer; message_secrets: Buffer }>(
      `SELECT credentials, message_secrets FROM tenant.courier_connections WHERE tenant_id = $1 AND courier_key = 'steadfast'`,
      [shopId],
    );
    const row = connection.rows[0];
    expect(row).toBeDefined();
    if (!row) return;
    expect(after.open(row.credentials, SecretPurpose.CourierCredentials, shopId)).toBe(
      '{"apiKey":"a"}',
    );
    expect(after.open(row.message_secrets, SecretPurpose.CourierMessages, shopId)).toBe(
      '{"route":"r","token":"t"}',
    );
    const lytro = await admin.query<{ credentials: Buffer }>(
      `SELECT credentials FROM control.platform_gateway_accounts WHERE method = 'bkash'`,
    );
    expect(
      after.open(
        lytro.rows[0]?.credentials ?? Buffer.alloc(0),
        SecretPurpose.GatewayCredentials,
        'lytro',
      ),
    ).toBe('{"appKey":"k"}');

    const again = await new SealedValuesReseal(app, changing).run();
    expect(again.reduce((sum, count) => sum + count.resealed, 0)).toBe(0);
    expect(
      again.find((count) => count.column === 'tenant.courier_connections.credentials')?.current,
    ).toBe(1);
  });

  it('lists every bytea column the database has, as sealed or as not', async () => {
    const columns = await admin.query<{ name: string }>(
      `SELECT table_schema || '.' || table_name || '.' || column_name AS name
       FROM information_schema.columns
       WHERE data_type = 'bytea' AND table_schema IN ('control', 'tenant')
       ORDER BY 1`,
    );
    const known = [
      ...SEALED_COLUMNS.map((column) => `${column.table}.${column.column}`),
      ...NOT_SEALED,
    ].sort();
    expect(columns.rows.map((row) => row.name)).toEqual(known);
  });
});

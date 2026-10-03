import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { ADMIN_URL, appDbUrl, testDbUrl } from './config';
import { connect, createTenant, type TenantFixture } from './helpers';

// Covers slice 2 schema of docs/PHASE-1-PLAN.md (TEN-19, TEN-26, AUTH-11).
let admin: pg.Client;
let app: pg.Client;
let tenant: TenantFixture;

beforeAll(async () => {
  admin = await connect(testDbUrl(ADMIN_URL));
  app = await connect(appDbUrl(ADMIN_URL));
  tenant = await createTenant(admin, 'Gamma');
});

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe('reserved slugs (TEN-26)', () => {
  it('seeds the platform names and the SRS labels', async () => {
    const result = await app.query<{ slug: string }>(
      'SELECT slug FROM control.reserved_slugs WHERE slug = ANY($1)',
      [['www', 'api', 'admin', 'status', 'support', 'platform']],
    );
    expect(result.rows.map((row) => row.slug).sort()).toEqual(
      ['admin', 'api', 'platform', 'status', 'support', 'www'].sort(),
    );
  });

  it('the application role can read the list without a tenant context', async () => {
    const result = await app.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM control.reserved_slugs',
    );
    expect(Number(result.rows[0]?.count)).toBeGreaterThan(10);
  });

  it('the application role cannot change the list', async () => {
    await expect(
      app.query("INSERT INTO control.reserved_slugs (slug, reason) VALUES ('shop', 'test')"),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('slug immutability (TEN-19, AUTH-11)', () => {
  it('refuses a slug change from the application role', async () => {
    await expect(
      app.query('UPDATE control.tenants SET slug = $1 WHERE id = $2', [
        'renamed-by-app',
        tenant.tenantId,
      ]),
    ).rejects.toThrow(/slug is immutable/);
  });

  it('refuses a slug change even from the admin role', async () => {
    await expect(
      admin.query('UPDATE control.tenants SET slug = $1 WHERE id = $2', [
        'renamed-by-admin',
        tenant.tenantId,
      ]),
    ).rejects.toThrow(/slug is immutable/);
  });

  it('still allows other updates, such as the shop display name', async () => {
    const result = await app.query(
      'UPDATE control.tenants SET shop_name = $1 WHERE id = $2 RETURNING shop_name',
      ['Gamma Renamed', tenant.tenantId],
    );
    expect(result.rows[0]).toEqual({ shop_name: 'Gamma Renamed' });
  });
});

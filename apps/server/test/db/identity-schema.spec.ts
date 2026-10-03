import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { ADMIN_URL, TEST_DB, appDbUrl } from './config';
import { connect, createTenant, createUser, inTenant, type TenantFixture } from './helpers';

// Covers slice 1 of docs/PHASE-1-PLAN.md. Test IDs refer to docs/PHASE-1-TEST-PLAN.md.
let admin: pg.Client;
let app: pg.Client;
let tenantA: TenantFixture;
let tenantB: TenantFixture;

const randomPhone = (prefix: string): string =>
  `${prefix}${randomUUID().replace(/\D/g, '').padEnd(10, '0').slice(0, 9)}`;

beforeAll(async () => {
  const adminTestUrl = new URL(ADMIN_URL);
  adminTestUrl.pathname = `/${TEST_DB}`;
  admin = await connect(adminTestUrl.toString());
  app = await connect(appDbUrl(ADMIN_URL));
  tenantA = await createTenant(admin, 'Alpha');
  tenantB = await createTenant(admin, 'Beta');
});

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe('migrations', () => {
  it('applies every migration in order and records them', async () => {
    const result = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations',
    );
    expect(Number(result.rows[0]?.count)).toBeGreaterThanOrEqual(2);
  });
});

describe('row-level security (DAT-03, TEN-24)', () => {
  it('the application role cannot bypass row-level security', async () => {
    const result = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
      ['lytronix_app'],
    );
    expect(result.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('a query without tenant context sees no tenant rows', async () => {
    await createUser(admin, tenantA.tenantId, randomPhone('0171'));
    const result = await app.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tenant.users',
    );
    expect(result.rows[0]?.count).toBe('0');
  });

  it('a tenant sees only its own rows', async () => {
    await createUser(admin, tenantB.tenantId, randomPhone('0171'));
    const seenByA = await inTenant(app, tenantA.tenantId, () =>
      app.query<{ tenant_id: string }>('SELECT DISTINCT tenant_id FROM tenant.users'),
    );
    expect(seenByA.rows.map((r) => r.tenant_id)).toEqual([tenantA.tenantId]);
  });

  it('a tenant cannot insert a row for another tenant', async () => {
    await expect(
      inTenant(app, tenantA.tenantId, () =>
        app.query('INSERT INTO tenant.users (tenant_id, phone) VALUES ($1, $2)', [
          tenantB.tenantId,
          randomPhone('0171'),
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('an insert without tenant context is refused', async () => {
    await expect(
      app.query('INSERT INTO tenant.users (tenant_id, phone) VALUES ($1, $2)', [
        tenantA.tenantId,
        randomPhone('0171'),
      ]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('activity log is insert-only (AUD-03, DAT-10)', () => {
  it('accepts an insert for its own tenant', async () => {
    const result = await inTenant(app, tenantA.tenantId, () =>
      app.query<{ id: string }>(
        `INSERT INTO tenant.activity_log (tenant_id, actor_type, action, result)
         VALUES ($1, 'system', 'test_insert', 'success') RETURNING id`,
        [tenantA.tenantId],
      ),
    );
    expect(result.rows).toHaveLength(1);
  });

  it('refuses updates and deletes for the application role', async () => {
    await expect(
      inTenant(app, tenantA.tenantId, () =>
        app.query("UPDATE tenant.activity_log SET result = 'x' WHERE action = 'test_insert'"),
      ),
    ).rejects.toThrow(/insert-only|permission denied/);
    await expect(
      inTenant(app, tenantA.tenantId, () =>
        app.query("DELETE FROM tenant.activity_log WHERE action = 'test_insert'"),
      ),
    ).rejects.toThrow(/insert-only|permission denied/);
  });

  it('refuses updates even for the admin role', async () => {
    await expect(
      admin.query("UPDATE tenant.activity_log SET result = 'x' WHERE action = 'test_insert'"),
    ).rejects.toThrow(/insert-only/);
  });
});

describe('tenant constraints (TEN-01, TEN-05, DAT-02)', () => {
  it('role names are unique within a tenant but may repeat across tenants', async () => {
    const name = `Manager-${randomUUID().slice(0, 6)}`;
    await admin.query('INSERT INTO tenant.roles (tenant_id, name) VALUES ($1, $2)', [
      tenantA.tenantId,
      name,
    ]);
    await admin.query('INSERT INTO tenant.roles (tenant_id, name) VALUES ($1, $2)', [
      tenantB.tenantId,
      name,
    ]);
    await expect(
      admin.query('INSERT INTO tenant.roles (tenant_id, name) VALUES ($1, $2)', [
        tenantA.tenantId,
        name,
      ]),
    ).rejects.toThrow(/duplicate key/);
  });

  it('a user cannot be linked to a role from another tenant', async () => {
    const userA = await createUser(admin, tenantA.tenantId, randomPhone('0171'));
    const roleB = await admin.query<{ id: string }>(
      'INSERT INTO tenant.roles (tenant_id, name) VALUES ($1, $2) RETURNING id',
      [tenantB.tenantId, `Cross-${randomUUID().slice(0, 6)}`],
    );
    await expect(
      admin.query(
        'INSERT INTO tenant.user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)',
        [tenantA.tenantId, userA, roleB.rows[0]?.id],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('an owner identity belongs to at most one tenant (TEN-15)', async () => {
    await expect(
      admin.query(
        `INSERT INTO control.tenants (owner_identity_id, subscriber_id, shop_name, slug)
         VALUES ($1, $2, 'Second', $3)`,
        [tenantA.identityId, tenantA.subscriberId, `second-${randomUUID().slice(0, 8)}`],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('platform constraints (AUTH-08, PLN-16, KYC-16)', () => {
  it('a subscriber identity is unique per kind across the platform', async () => {
    const value = randomPhone('0172');
    const subscriber = await admin.query<{ id: string }>(
      'INSERT INTO control.subscribers DEFAULT VALUES RETURNING id',
    );
    const subscriberId = subscriber.rows[0]?.id;
    await admin.query(
      "INSERT INTO control.subscriber_identities (subscriber_id, kind, value, verified_at) VALUES ($1, 'phone', $2, now())",
      [subscriberId, value],
    );
    await expect(
      admin.query(
        "INSERT INTO control.subscriber_identities (subscriber_id, kind, value, verified_at) VALUES ($1, 'phone', $2, now())",
        [subscriberId, value],
      ),
    ).rejects.toThrow(/duplicate key/);
    // The same value under another kind is a separate identity (AUTH-08: never cross-checked).
    await admin.query(
      "INSERT INTO control.subscriber_identities (subscriber_id, kind, value, verified_at) VALUES ($1, 'email', $2, now())",
      [subscriberId, value],
    );
  });

  it('KYC status accepts only the defined values', async () => {
    await expect(
      admin.query("UPDATE control.tenants SET kyc_status = 'bogus' WHERE id = $1", [
        tenantA.tenantId,
      ]),
    ).rejects.toThrow(/check constraint/);
  });

  it('only one plan per rank is offered for sale (PLN-16)', async () => {
    const rank = 900 + Math.floor(Math.random() * 90);
    await admin.query(
      "INSERT INTO control.plans (name, rank, limits, for_sale) VALUES ('Test', $1, '{}', true)",
      [rank],
    );
    await expect(
      admin.query(
        "INSERT INTO control.plans (name, rank, limits, for_sale) VALUES ('Dup', $1, '{}', true)",
        [rank],
      ),
    ).rejects.toThrow(/duplicate key/);
    // A plan that is not for sale may share the rank.
    await admin.query(
      "INSERT INTO control.plans (name, rank, limits, for_sale) VALUES ('Internal', $1, '{}', false)",
      [rank],
    );
  });

  it('session tokens are stored as unique hashes, and readable without tenant context', async () => {
    const hash = `hash-${randomUUID()}`;
    await admin.query(
      `INSERT INTO control.sessions (token_hash, csrf_hash, subscriber_id, tenant_id, expires_at)
       VALUES ($1, 'csrf', $2, $3, now() + interval '7 days')`,
      [hash, tenantA.subscriberId, tenantA.tenantId],
    );
    const seen = await app.query<{ token_hash: string }>(
      'SELECT token_hash FROM control.sessions WHERE token_hash = $1',
      [hash],
    );
    expect(seen.rows).toHaveLength(1);
    await expect(
      admin.query(
        `INSERT INTO control.sessions (token_hash, csrf_hash, subscriber_id, tenant_id, expires_at)
         VALUES ($1, 'csrf', $2, $3, now() + interval '7 days')`,
        [hash, tenantA.subscriberId, tenantA.tenantId],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('application role privileges (DAT-10, SEC-03)', () => {
  it('cannot change the schema', async () => {
    await expect(app.query('DROP TABLE tenant.users')).rejects.toThrow(
      /must be owner|permission denied/,
    );
  });

  it('cannot delete platform audit entries', async () => {
    await expect(app.query('DELETE FROM control.platform_audit_log')).rejects.toThrow(
      /insert-only|permission denied/,
    );
  });
});

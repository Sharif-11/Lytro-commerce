import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { DatabaseConnector, type DatabaseHandle, TenantRepository } from '../src/index';

import { ADMIN_URL, appDbUrl, testDbUrl } from './config';
import { connect, createTenant, type TenantFixture } from './helpers';

// Covers the tenant lookups used by the host resolver (TEN-7a, TEN-12, TEN-24, TEN-27).
// The functions run through the production client as the application role, as the server will.
let admin: pg.Client;
let handle: DatabaseHandle;
let tenant: TenantFixture;
let slug: string;

beforeAll(async () => {
  admin = await connect(testDbUrl(ADMIN_URL));
  handle = new DatabaseConnector().connect(appDbUrl(ADMIN_URL));
  tenant = await createTenant(admin, 'Lookup');
  const row = await admin.query<{ slug: string }>(
    'SELECT slug FROM control.tenants WHERE id = $1',
    [tenant.tenantId],
  );
  slug = row.rows[0]?.slug ?? '';
});

afterAll(async () => {
  await handle.close();
  await admin.end();
});

async function addDomain(hostname: string, status: string): Promise<void> {
  await admin.query(
    'INSERT INTO control.tenant_domains (tenant_id, hostname, status) VALUES ($1, $2, $3)',
    [tenant.tenantId, hostname, status],
  );
}

describe('findTenantBySlug (TEN-7a)', () => {
  it('returns the shop id, slug and state for an existing slug', async () => {
    const found = await new TenantRepository().findBySlug(handle.db, slug);
    expect(found).toEqual({ id: tenant.tenantId, slug, state: 'trial' });
  });

  it('returns null for an unknown slug or a reserved label', async () => {
    expect(await new TenantRepository().findBySlug(handle.db, 'no-such-shop-xyz')).toBeNull();
    expect(await new TenantRepository().findBySlug(handle.db, 'www')).toBeNull();
  });
});

describe('findTenantByActiveDomain (TEN-12)', () => {
  const active = `shop-${randomUUID().slice(0, 8)}.example.test`;
  const pending = `pending-${randomUUID().slice(0, 8)}.example.test`;
  const failed = `failed-${randomUUID().slice(0, 8)}.example.test`;
  const removed = `removed-${randomUUID().slice(0, 8)}.example.test`;

  beforeAll(async () => {
    await addDomain(active, 'active');
    await addDomain(pending, 'pending');
    await addDomain(failed, 'failed');
    await addDomain(removed, 'removed');
  });

  it('returns the owning shop for a verified, active domain', async () => {
    const found = await new TenantRepository().findByActiveDomain(handle.db, active);
    expect(found?.id).toBe(tenant.tenantId);
  });

  it('returns null for pending, failed and removed domains', async () => {
    expect(await new TenantRepository().findByActiveDomain(handle.db, pending)).toBeNull();
    expect(await new TenantRepository().findByActiveDomain(handle.db, failed)).toBeNull();
    expect(await new TenantRepository().findByActiveDomain(handle.db, removed)).toBeNull();
  });

  it('returns null for a domain that was never registered', async () => {
    expect(
      await new TenantRepository().findByActiveDomain(handle.db, 'unknown.example.test'),
    ).toBeNull();
  });
});

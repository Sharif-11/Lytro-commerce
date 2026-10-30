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

// Slice 13: a shop has one domain while not removed, each with its twin (megh.com and www.megh.com), which answers
// only while its record points here.
async function addDomain(
  hostname: string,
  status: string,
  owner: TenantFixture = tenant,
  twinActive = false,
): Promise<void> {
  await admin.query(
    `INSERT INTO control.tenant_domains (tenant_id, hostname, twin, twin_active, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [owner.tenantId, hostname, `www.${hostname}`, twinActive, status],
  );
}

describe('findTenantBySlug (TEN-7a)', () => {
  it('returns the shop id, slug and state for an existing slug', async () => {
    const found = await new TenantRepository().findBySlug(handle.db, slug);
    expect(found).toEqual({ id: tenant.tenantId, slug, state: 'trial', suspendedAt: null });
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
  const quiet = `quiet-${randomUUID().slice(0, 8)}.example.test`;
  let quietShop: TenantFixture;

  beforeAll(async () => {
    await addDomain(removed, 'removed');
    await addDomain(active, 'active', tenant, true);
    await addDomain(pending, 'pending', await createTenant(admin, 'Lookup pending'));
    await addDomain(failed, 'failed', await createTenant(admin, 'Lookup failed'));
    quietShop = await createTenant(admin, 'Lookup quiet');
    await addDomain(quiet, 'active', quietShop);
  });

  it('returns the owning shop for a verified, active domain', async () => {
    const found = await new TenantRepository().findByActiveDomain(handle.db, active);
    expect(found?.id).toBe(tenant.tenantId);
    expect((await new TenantRepository().findByActiveDomain(handle.db, quiet))?.id).toBe(
      quietShop.tenantId,
    );
  });

  it("returns the owning shop for an active domain's twin only while the twin's record points here", async () => {
    const found = await new TenantRepository().findByActiveDomain(handle.db, `www.${active}`);
    expect(found?.id).toBe(tenant.tenantId);
    expect(await new TenantRepository().findByActiveDomain(handle.db, `www.${quiet}`)).toBeNull();
    expect(await new TenantRepository().findByActiveDomain(handle.db, `www.${pending}`)).toBeNull();
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

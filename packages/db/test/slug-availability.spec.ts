import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createDatabase, type DatabaseHandle } from '../src/client';
import { findUnavailableSlugs } from '../src/repositories/tenancy/slug-availability';
import { ADMIN_URL, appDbUrl, testDbUrl } from './config';
import { connect, createTenant, type TenantFixture } from './helpers';

// AUTH-11, TEN-26: one batch query reports which candidate slugs a shop holds or which are reserved.
let admin: pg.Client;
let handle: DatabaseHandle;
let tenant: TenantFixture;
let takenSlug: string;

beforeAll(async () => {
  admin = await connect(testDbUrl(ADMIN_URL));
  handle = createDatabase(appDbUrl(ADMIN_URL));
  tenant = await createTenant(admin, 'Availability');
  const row = await admin.query<{ slug: string }>(
    'SELECT slug FROM control.tenants WHERE id = $1',
    [tenant.tenantId],
  );
  takenSlug = row.rows[0]?.slug ?? '';
});

afterAll(async () => {
  await handle.close();
  await admin.end();
});

describe('findUnavailableSlugs (AUTH-11, TEN-26)', () => {
  it('reports a slug held by a shop', async () => {
    const unavailable = await findUnavailableSlugs(handle.db, [takenSlug, 'free-slug-xyz']);
    expect(unavailable.has(takenSlug)).toBe(true);
    expect(unavailable.has('free-slug-xyz')).toBe(false);
  });

  it('reports reserved labels as unavailable', async () => {
    const unavailable = await findUnavailableSlugs(handle.db, ['admin', 'www', 'free-slug-xyz']);
    expect([...unavailable].sort()).toEqual(['admin', 'www']);
  });

  it('answers an empty batch without a query', async () => {
    expect((await findUnavailableSlugs(handle.db, [])).size).toBe(0);
  });
});

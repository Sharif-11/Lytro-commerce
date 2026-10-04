import 'dotenv/config';
import { Controller, Get, type INestApplication, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '@lytronix/db';
import { prepareTestDatabase, seedShop } from './support/database';
import { HealthController } from '../src/health/health.controller';
import {
  DrizzleSlugAvailability,
  DrizzleTenantDirectory,
} from '../src/database/adapters/tenancy.adapter';
import { SlugService } from '../src/tenancy/services/slug.service';
import { TenantCache } from '../src/tenancy/services/tenant-cache';
import { EDGE_HEADER, TenantGuard, type TenantRequest } from '../src/common/guards/tenant.guard';
import { TenantResolver } from '../src/tenancy/services/tenant-resolver.service';
import {
  PLATFORM_DOMAIN,
  SLUG_AVAILABILITY,
  TENANT_DIRECTORY,
  TRUSTED_EDGE_SECRET,
} from '../src/tenancy/tokens';

// Covers the tenant resolver end to end against a real migrated database (P1-E05, P1-E06, TEN-24).
// Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does. It uses its own database so it
// never shares state with the database package's tests.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_tenancy_test';
const SECRET = 'e'.repeat(32);

@Controller('probe')
class ProbeController {
  @Get()
  read(@Req() req: TenantRequest): { tenantId: string | undefined } {
    return { tenantId: req.tenant?.id };
  }
}

function send(
  port: number,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const edge = { [EDGE_HEADER]: SECRET };

let admin: pg.Client;
let handle: DatabaseHandle;
let app: INestApplication;
let port: number;
let cache: TenantCache;
let shopId: string;
let archivedId: string;

const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

beforeAll(async () => {
  if (!ADMIN_URL) return;

  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  shopId = await seedShop(admin, 'Fashion House', 'fashion-house');
  archivedId = await seedShop(admin, 'Old Shop', 'old-shop', 'archived');
  await admin.query(
    `INSERT INTO control.tenant_domains (tenant_id, hostname, status) VALUES
       ($1, 'www.fashionhouse.test', 'active'),
       ($1, 'pending.fashionhouse.test', 'pending')`,
    [shopId],
  );

  handle = createDatabase(appDbUrl);
  cache = new TenantCache();
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController, HealthController],
    providers: [
      { provide: TENANT_DIRECTORY, useValue: new DrizzleTenantDirectory(handle.db) },
      { provide: SLUG_AVAILABILITY, useValue: new DrizzleSlugAvailability(handle.db) },
      { provide: TenantCache, useValue: cache },
      { provide: PLATFORM_DOMAIN, useValue: 'localhost' },
      { provide: TRUSTED_EDGE_SECRET, useValue: SECRET },
      TenantResolver,
      SlugService,
      { provide: APP_GUARD, useClass: TenantGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await handle.close();
  await admin.end();
});

describeIfDatabase('tenant resolution against the database (TEN-7a, TEN-24)', () => {
  it('serves a known shop by its subdomain', async () => {
    const response = await send(port, '/probe', { ...edge, host: 'fashion-house.localhost' });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ tenantId: shopId });
  });

  it('serves a shop by its active custom domain', async () => {
    const response = await send(port, '/probe', { ...edge, host: 'www.fashionhouse.test' });
    expect(JSON.parse(response.body)).toEqual({ tenantId: shopId });
  });

  it('refuses a pending custom domain as not found, so unverified domains never route', async () => {
    const response = await send(port, '/probe', { ...edge, host: 'pending.fashionhouse.test' });
    expect(response.status).toBe(404);
  });

  it('refuses an unknown host and a reserved label as not found (P1-E06)', async () => {
    expect((await send(port, '/probe', { ...edge, host: 'nobody.localhost' })).status).toBe(404);
    expect((await send(port, '/probe', { ...edge, host: 'www.localhost' })).status).toBe(404);
  });

  it('answers an archived shop with 503 and no shop id', async () => {
    const response = await send(port, '/probe', { ...edge, host: 'old-shop.localhost' });
    expect(response.status).toBe(503);
    expect(response.body).not.toContain(archivedId);
  });

  it('ignores a tenant id forged in a header (TEN-24, P1-E06)', async () => {
    const response = await send(port, '/probe', {
      ...edge,
      host: 'fashion-house.localhost',
      'x-tenant-id': archivedId,
    });
    expect(JSON.parse(response.body)).toEqual({ tenantId: shopId });
  });

  it('keeps a suspended shop open for up to the cache lifetime, then closes it once invalidated (R5)', async () => {
    await send(port, '/probe', { ...edge, host: 'fashion-house.localhost' });
    await admin.query("UPDATE control.tenants SET state = 'locked' WHERE id = $1", [shopId]);

    const cached = await send(port, '/probe', { ...edge, host: 'fashion-house.localhost' });
    expect(cached.status).toBe(200);

    cache.invalidateTenant(shopId);
    const afterInvalidate = await send(port, '/probe', {
      ...edge,
      host: 'fashion-house.localhost',
    });
    expect(afterInvalidate.status).toBe(503);

    await admin.query("UPDATE control.tenants SET state = 'active' WHERE id = $1", [shopId]);
    cache.invalidateTenant(shopId);
  });
});

describeIfDatabase('slug suggestions against the database (AUTH-11, TEN-26)', () => {
  it('suggests the next free address when the name is taken', async () => {
    const slugs = new SlugService(new DrizzleSlugAvailability(handle.db));
    expect(await slugs.suggest('Fashion House')).toBe('fashion-house-2');
  });

  it('suggests admin-2 for a shop named Admin, since admin is reserved', async () => {
    const slugs = new SlugService(new DrizzleSlugAvailability(handle.db));
    expect(await slugs.suggest('Admin')).toBe('admin-2');
  });

  it('accepts a free address and refuses a taken one with a suggestion', async () => {
    const slugs = new SlugService(new DrizzleSlugAvailability(handle.db));
    expect(await slugs.checkAddress('brand-new-shop')).toEqual({
      ok: true,
      address: 'brand-new-shop',
    });
    expect(await slugs.checkAddress('old-shop')).toEqual({
      ok: false,
      reason: 'unavailable',
      suggestion: 'old-shop-2',
    });
  });

  it('gives no suggestion for a Bangla-only shop name, so the owner types an address', async () => {
    const slugs = new SlugService(new DrizzleSlugAvailability(handle.db));
    expect(await slugs.suggest('ফ্যাশন হাউস')).toBeNull();
  });
});

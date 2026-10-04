import 'dotenv/config';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DiscoveryModule } from '@nestjs/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app/app.module';
import { prepareTestDatabase, seedShop } from '../support/database';
import { ISOLATION_REGISTRY } from './registry';
import { compareWithRegistry, listTenantRoutes } from './inventory';

// SEC-02, TEN-03, TEN-04, TEN-05: isolation across every shop-owned route and in the data layer.
// Covers P1-I01 and P1-I02 for the routes that exist; new routes are checked by the registry (see registry.ts).
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_isolation_test';

@Controller('probe')
class ProbeController {
  @Get()
  read(): string {
    return 'probe';
  }
}

describe('registry comparison (self-check)', () => {
  it('reports a shop-owned route that has no isolation case', () => {
    const result = compareWithRegistry(['GET /orders/:id', 'POST /products'], {
      'GET /orders/:id': 'another shop order is not_found',
    });
    expect(result).toEqual({ uncovered: ['POST /products'], stale: [] });
  });

  it('reports a case whose route no longer exists', () => {
    const result = compareWithRegistry(['GET /orders/:id'], {
      'GET /orders/:id': 'case',
      'DELETE /old-route': 'case for a removed route',
    });
    expect(result).toEqual({ uncovered: [], stale: ['DELETE /old-route'] });
  });

  it('reports nothing when routes and cases match', () => {
    const result = compareWithRegistry(['GET /orders/:id'], { 'GET /orders/:id': 'case' });
    expect(result).toEqual({ uncovered: [], stale: [] });
  });

  it('sees a route added to the application, and fails until a case is registered', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [ProbeController],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();
    try {
      const routes = listTenantRoutes(app);
      expect(routes).toEqual(['GET /probe']);
      expect(compareWithRegistry(routes, {}).uncovered).toEqual(['GET /probe']);
      expect(compareWithRegistry(routes, { 'GET /probe': 'case' })).toEqual({
        uncovered: [],
        stale: [],
      });
    } finally {
      await app.close();
    }
  });
});

const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let admin: pg.Client;
let appClient: pg.Client;
let shopA: string;
let shopB: string;
let roleA: string;
let roleB: string;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] ??= 'test-only-otp-secret-0123456789abcdef';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  shopA = await seedShop(admin, 'Fashion House', 'fashion-house');
  shopB = await seedShop(admin, 'Fashion House Two', 'fashion-house-two');
  // Overlapping data: both shops hold a role with the same name (TEN-05 allows this across shops).
  roleA = await insertRole(shopA);
  roleB = await insertRole(shopB);

  appClient = new pg.Client({ connectionString: appDbUrl });
  await appClient.connect();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, DiscoveryModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await appClient.end();
  await admin.end();
});

async function insertRole(tenantId: string): Promise<string> {
  const result = await admin.query<{ id: string }>(
    'INSERT INTO tenant.roles (tenant_id, name) VALUES ($1, $2) RETURNING id',
    [tenantId, 'Manager'],
  );
  return result.rows[0]?.id ?? '';
}

/** Runs a query as the application role inside one shop's context, the way the server will (DAT-03). */
async function queryAsShop(
  tenantId: string,
  sql: string,
  params: string[],
): Promise<pg.QueryResult> {
  await appClient.query('BEGIN');
  try {
    await appClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await appClient.query(sql, params);
    await appClient.query('COMMIT');
    return result;
  } catch (error) {
    await appClient.query('ROLLBACK');
    throw error;
  }
}

describeIfDatabase('route inventory against the application (SEC-02)', () => {
  it('lists no shop-owned routes yet, and the registry agrees', () => {
    const routes = listTenantRoutes(app);
    expect(routes).toEqual([]);
    expect(compareWithRegistry(routes, ISOLATION_REGISTRY)).toEqual({ uncovered: [], stale: [] });
  });
});

describeIfDatabase('data layer isolation (SEC-02, TEN-03, TEN-04)', () => {
  it("a shop cannot read another shop's record by ID (returns no row, as not_found)", async () => {
    const result = await queryAsShop(shopA, 'SELECT id FROM tenant.roles WHERE id = $1', [roleB]);
    expect(result.rows).toHaveLength(0);
  });

  it('a shop can read its own record by the same ID', async () => {
    const result = await queryAsShop(shopA, 'SELECT id FROM tenant.roles WHERE id = $1', [roleA]);
    expect(result.rows).toHaveLength(1);
  });

  it("a list returns only the shop's own rows, even with the same names in both shops (TEN-04)", async () => {
    const result = await queryAsShop(shopA, 'SELECT id FROM tenant.roles', []);
    expect(result.rows.map((row: { id: string }) => row.id)).toEqual([roleA]);
  });

  it("a shop cannot change another shop's record by ID", async () => {
    const result = await queryAsShop(
      shopA,
      "UPDATE tenant.roles SET name = 'Hacked' WHERE id = $1",
      [roleB],
    );
    expect(result.rowCount).toBe(0);
    const check = await admin.query<{ name: string }>(
      'SELECT name FROM tenant.roles WHERE id = $1',
      [roleB],
    );
    expect(check.rows[0]?.name).toBe('Manager');
  });
});

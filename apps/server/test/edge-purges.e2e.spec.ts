import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DeliveryZoneRepository, TransactionRunner } from '@lytronix/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { DatabaseService } from '../src/database/database.service';
import { DEFAULT_ORDERS_PER_SHOP_PER_MINUTE } from '../src/modules/public-api/services/order-limits';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// D9-32 (Slice 9.10): a change to what a shop's pages show queues, in its own transaction, the purge of the pages
// Cloudflare keeps -- one product's pages for a field of that product, the shop's lists too when one comes or goes, and
// every page of the shop for its categories or settings. Also the slice's two server fixes: an estimate on a shop with
// its zones writes nothing, and one shop's shoppers may place 180 orders a minute.

const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_edge_purges_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'edge-purges-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** Every purge queued so far, oldest first, as the tags each names. */
async function queued(): Promise<string[][]> {
  const { rows } = await admin.query<{ tags: string[] }>(
    `SELECT payload->'tags' AS tags FROM control.job_outbox
     WHERE queue_name = 'edge_purge' ORDER BY id`,
  );
  return rows.map((row) => row.tags);
}

/** The purges a step queues: what is queued after it that was not before. */
async function queuedBy(step: () => Promise<unknown>): Promise<string[][]> {
  const before = (await queued()).length;
  await step();
  return (await queued()).slice(before);
}

async function product(shop: ShopClient, stock: number): Promise<string> {
  const made = await shop.post('/products', {
    name: 'Lamp',
    basePrice: 300,
    variants: [{ optionIds: [], openingStock: stock }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { id: string }).id;
}

describeIfDatabase("what a change queues for Cloudflare's copies (D9-32)", () => {
  it("a new product drops the shop's lists and its own pages", async () => {
    const shop = await openShop(port, texts, 'edge-new');
    let id = '';
    const purges = await queuedBy(async () => {
      id = await product(shop, 5);
    });
    expect(purges).toContainEqual([`l:${shop.slug}`, `p:${id}`]);
  });

  it("a price edit drops that product's pages alone, not the shop's", async () => {
    const shop = await openShop(port, texts, 'edge-price');
    const id = await product(shop, 5);
    const purges = await queuedBy(async () => {
      const edited = await shop.patch(`/products/${id}`, { basePrice: 450 });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    });
    expect(purges).toEqual([[`p:${id}`]]);
  });

  it("hiding a product drops the shop's lists too", async () => {
    const shop = await openShop(port, texts, 'edge-hide');
    const id = await product(shop, 5);
    const purges = await queuedBy(async () => {
      const hidden = await shop.patch(`/products/${id}`, { active: false });
      expect(hidden.status, JSON.stringify(hidden.body)).toBe(200);
    });
    expect(purges).toContainEqual([`l:${shop.slug}`, `p:${id}`]);
    expect(purges.flat()).not.toContain(`s:${shop.slug}`);
  });

  it("stock coming back drops that product's pages", async () => {
    const shop = await openShop(port, texts, 'edge-stock');
    const id = await product(shop, 0);
    const detail = (await shop.get(`/products/${id}`)).body as { variants: { id: string }[] };
    const variantId = detail.variants[0]?.id ?? '';
    const purges = await queuedBy(async () => {
      const added = await shop.post(`/products/${id}/stock-additions`, {
        additions: [{ variantId, quantity: 3 }],
      });
      expect(added.status, JSON.stringify(added.body)).toBe(200);
    });
    expect(purges).toContainEqual([`p:${id}`]);
    expect(purges.flat()).not.toContain(`s:${shop.slug}`);
  });

  it('a category, made or renamed, drops every page of the shop', async () => {
    const shop = await openShop(port, texts, 'edge-category');
    let id = '';
    const made = await queuedBy(async () => {
      const result = await shop.post('/categories', { name: 'Lights' });
      expect(result.status, JSON.stringify(result.body)).toBe(201);
      id = (result.body as { id: string }).id;
    });
    expect(made).toEqual([[`s:${shop.slug}`]]);
    const renamed = await queuedBy(() => shop.patch(`/categories/${id}`, { name: 'Lamps' }));
    expect(renamed).toEqual([[`s:${shop.slug}`]]);
  });

  it("the shop's contact details drop every page of the shop", async () => {
    const shop = await openShop(port, texts, 'edge-settings');
    const purges = await queuedBy(async () => {
      const saved = await shop.patch('/shop-settings', { whatsapp: '01712345678' });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    });
    expect(purges).toEqual([[`s:${shop.slug}`]]);
  });

  it('each purge waits for the change it names: nothing is queued for a refused one', async () => {
    const shop = await openShop(port, texts, 'edge-refused');
    const id = await product(shop, 5);
    const purges = await queuedBy(async () => {
      const refused = await shop.patch(`/products/${id}`, { basePrice: -5 });
      expect(refused.status).toBe(400);
    });
    expect(purges).toEqual([]);
  });
});

describeIfDatabase("a shop's zones are read without writing (Slice 9.10's staging run)", () => {
  const DEFAULTS = { homeCityCode: 'DHK', homeCharge: '60.00', fallbackCharge: '120.00' };

  /** Whether the step wrote anything: a transaction gets its id only when it writes. */
  async function wrote(tenantId: string): Promise<boolean> {
    const runner = app.get(TransactionRunner);
    const db = app.get(DatabaseService).handle.db;
    return runner.run(db, async (tx) => {
      await app.get(DeliveryZoneRepository).ensureDefaults(tx, tenantId, DEFAULTS);
      const { rows } = await tx.execute<{ id: string | null }>(
        'SELECT txid_current_if_assigned()::text AS id',
      );
      return rows[0]?.id !== null;
    });
  }

  it("makes a new shop's home and fallback zones once, then writes nothing", async () => {
    const shop = await openShop(port, texts, 'edge-zones');
    await admin.query('DELETE FROM tenant.delivery_zone_areas WHERE tenant_id = $1', [
      shop.tenantId,
    ]);
    await admin.query('DELETE FROM tenant.delivery_zones WHERE tenant_id = $1', [shop.tenantId]);
    expect(await wrote(shop.tenantId)).toBe(true);
    expect(await wrote(shop.tenantId)).toBe(false);
    const { rows } = await admin.query<{ home: number; fallback: number }>(
      `SELECT count(*) FILTER (WHERE is_home)::int AS home, count(*) FILTER (WHERE is_fallback)::int AS fallback
       FROM tenant.delivery_zones WHERE tenant_id = $1`,
      [shop.tenantId],
    );
    expect(rows[0]).toEqual({ home: 1, fallback: 1 });
  });
});

describeIfDatabase("one shop's orders a minute (RTE-08, D9-32)", () => {
  it('are 180, in the stored setting and when none is stored', async () => {
    const { rows } = await admin.query<{ value: unknown }>(
      `SELECT value FROM control.platform_settings WHERE key = 'public_orders_per_shop_per_minute'`,
    );
    expect(rows[0]?.value).toBe(180);
    expect(DEFAULT_ORDERS_PER_SHOP_PER_MINUTE).toBe(180);
  });
});

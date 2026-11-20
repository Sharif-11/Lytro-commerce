import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PublicCardFacts } from '@lytronix/db';
import { STOREFRONT_BEST_SELLER_BADGES, STOREFRONT_BEST_SELLER_DAYS } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { DAY_MS } from '../src/common/time';
import type { PublicCatalogueStore } from '../src/modules/public-api/ports/public-catalogue-store';
import { CardFacts } from '../src/modules/public-api/services/card-facts';
import { PUBLIC_CATALOGUE_STORE } from '../src/modules/public-api/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { CardFactsTickWorker } from '../src/modules/shared/queue-workers/services/card-facts-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// SB-10 (the owner, 2026-11-20): a shop's cards' "ordered" and best-seller facts kept per shop and worked out again by
// the minute pass, against a real database -- the kept facts are what the live read works out, a list reads them while
// they are trusted, and a shop is worked out again only when it is due (a change after a few minutes, or a day on).
// The pass's schedule is left off here, so only the test runs it. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_card_facts_test';
// Each test makes products and hands orders over: longer than the default limit on a busy machine.
const SLOW = 60_000;

const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'card-facts-e2e-otp-secret-0123456789abcdefgh';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(CardFactsTickWorker)
    .useValue({ onModuleInit: () => Promise.resolve() })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

async function product(
  shop: ShopClient,
  name: string,
  body: Record<string, unknown> = {},
): Promise<{ id: string; variantId: string }> {
  const made = await shop.post('/products', {
    name,
    basePrice: 1000,
    variants: [{ optionIds: [], openingStock: 20 }],
    ...body,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const created = made.body as { id: string; variants: { id: string }[] };
  return { id: created.id, variantId: created.variants[0]?.id ?? '' };
}

/** A takeaway order handed over: delivered, so the sales figures and the cards count it (Slice 4.7). */
async function sold(
  shop: ShopClient,
  items: { variantId: string; quantity: number }[],
): Promise<{ id: string; items: { id: string; variantId: string }[] }> {
  const placed = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: `017${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`,
      fulfilmentType: 'takeaway',
      items,
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(placed.status, JSON.stringify(placed.body)).toBe(201);
  const order = placed.body as { id: string; items: { id: string; variantId: string }[] };
  const handed = await shop.post(`/orders/${order.id}/hand-over`, {});
  expect(handed.status, JSON.stringify(handed.body)).toBe(200);
  return order;
}

/** What a list's cards say of these products, as the public catalogue reads it. */
async function cardFacts(shop: ShopClient, ids: string[]): Promise<PublicCardFacts[]> {
  const store = app.get<PublicCatalogueStore>(PUBLIC_CATALOGUE_STORE);
  const since = new Date(Date.now() - STOREFRONT_BEST_SELLER_DAYS * DAY_MS);
  const rows = await store.run((tx) =>
    store.cardFacts(tx, shop.tenantId, ids, since, STOREFRONT_BEST_SELLER_BADGES),
  );
  return [...rows].sort((a, b) => ids.indexOf(a.productId) - ids.indexOf(b.productId));
}

/** The shop's kept facts, as the table holds them. */
async function kept(shop: ShopClient): Promise<Record<string, [number, boolean]>> {
  const { rows } = await admin.query<{ product_id: string; ordered: number; best_seller: boolean }>(
    'SELECT product_id, ordered, best_seller FROM tenant.product_card_facts WHERE tenant_id = $1',
    [shop.tenantId],
  );
  return Object.fromEntries(rows.map((row) => [row.product_id, [row.ordered, row.best_seller]]));
}

async function workedAt(shop: ShopClient): Promise<Date | null> {
  const { rows } = await admin.query<{ worked_at: Date }>(
    'SELECT worked_at FROM tenant.card_fact_runs WHERE tenant_id = $1',
    [shop.tenantId],
  );
  return rows[0]?.worked_at ?? null;
}

/** The shop's last run, moved back in time. */
async function ranAgo(shop: ShopClient, interval: string): Promise<void> {
  await admin.query(
    `UPDATE tenant.card_fact_runs SET worked_at = now() - $2::interval WHERE tenant_id = $1`,
    [shop.tenantId, interval],
  );
}

/**
 * Every order of the shop as last changed long ago. The orders guard keeps an order's times, so this one update runs
 * with triggers off, in the admin session's own transaction only.
 */
async function ordersChangedAgo(shop: ShopClient, interval: string): Promise<void> {
  await admin.query('BEGIN');
  try {
    await admin.query('SET LOCAL session_replication_role = replica');
    await admin.query(
      `UPDATE tenant.orders SET updated_at = now() - $2::interval WHERE tenant_id = $1`,
      [shop.tenantId, interval],
    );
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

function runTick(): Promise<unknown> {
  return app.get(CardFacts).runTick(new Date());
}

describeIfDatabase('a shop’s kept card facts (SB-10)', () => {
  it(
    'keeps what a list works out live, and a list reads them while they are trusted',
    async () => {
      const shop = await openShop(port, texts, 'cf-keep');
      const plain = await product(shop, 'Plain');
      const fifth = await product(shop, 'Fifth');
      const never = await product(shop, 'Never');
      const low = await product(shop, 'Low', {
        lowStockThreshold: 5,
        variants: [{ optionIds: [], openingStock: 3 }],
      });
      await sold(shop, [{ variantId: plain.variantId, quantity: 4 }]);
      await sold(shop, [{ variantId: plain.variantId, quantity: 1 }]);
      await sold(shop, [{ variantId: fifth.variantId, quantity: 2 }]);
      const ids = [plain.id, fifth.id, never.id, low.id];

      // Never worked out: the list works them out from the orders, as before.
      expect(await workedAt(shop)).toBeNull();
      const live = await cardFacts(shop, ids);
      expect(live).toEqual([
        { productId: plain.id, left: null, ordered: 2, bestSeller: true },
        { productId: fifth.id, left: null, ordered: 1, bestSeller: true },
        { productId: never.id, left: null, ordered: 0, bestSeller: false },
        { productId: low.id, left: 3, ordered: 0, bestSeller: false },
      ]);

      await runTick();
      expect(await workedAt(shop)).not.toBeNull();
      // Only a product ordered at least once has a row.
      expect(await kept(shop)).toEqual({ [plain.id]: [2, true], [fifth.id]: [1, true] });
      expect(await cardFacts(shop, ids)).toEqual(live);

      // While trusted, the list reads the kept rows (here changed by hand); "only N left" stays live.
      await admin.query(
        'UPDATE tenant.product_card_facts SET ordered = 99 WHERE tenant_id = $1 AND product_id = $2',
        [shop.tenantId, plain.id],
      );
      expect((await cardFacts(shop, ids))[0]).toEqual({
        productId: plain.id,
        left: null,
        ordered: 99,
        bestSeller: true,
      });
      // Kept more than a day ago, the pass has stopped: the list works them out from the orders again.
      await ranAgo(shop, '26 hours');
      expect(await cardFacts(shop, ids)).toEqual(live);
    },
    SLOW,
  );

  it(
    'works a shop out again only when due: a change after a few minutes, or a day on',
    async () => {
      const shop = await openShop(port, texts, 'cf-due');
      const lamp = await product(shop, 'Lamp');
      const mug = await product(shop, 'Mug');
      await sold(shop, [{ variantId: lamp.variantId, quantity: 1 }]);
      await runTick();
      expect(await kept(shop)).toEqual({ [lamp.id]: [1, true] });
      const first = await workedAt(shop);

      // Worked out a moment ago: a new sale waits for the next run past the few minutes.
      await sold(shop, [{ variantId: mug.variantId, quantity: 1 }]);
      await runTick();
      expect(await workedAt(shop)).toEqual(first);
      expect(await kept(shop)).toEqual({ [lamp.id]: [1, true] });

      // A few minutes on, with an order changed since: worked out again, the new sale counted.
      await ranAgo(shop, '5 minutes');
      await runTick();
      expect(await kept(shop)).toEqual({ [lamp.id]: [1, true], [mug.id]: [1, true] });

      // A few minutes on with nothing changed: left as it is.
      await ordersChangedAgo(shop, '1 hour');
      await ranAgo(shop, '5 minutes');
      const quiet = await workedAt(shop);
      await runTick();
      expect(await workedAt(shop)).toEqual(quiet);

      // A day on, changed or not: worked out again (the best sellers' window has moved).
      await ranAgo(shop, '25 hours');
      await runTick();
      const fresh = await workedAt(shop);
      expect(fresh).not.toBeNull();
      expect(Date.now() - (fresh?.getTime() ?? 0)).toBeLessThan(60_000);
    },
    SLOW,
  );

  it(
    'counts an item that came back: the order is marked changed, and its product is worked out again',
    async () => {
      const shop = await openShop(port, texts, 'cf-return');
      const shawl = await product(shop, 'Shawl');
      const scarf = await product(shop, 'Scarf');
      const order = await sold(shop, [
        { variantId: shawl.variantId, quantity: 1 },
        { variantId: scarf.variantId, quantity: 1 },
      ]);
      await runTick();
      expect(await kept(shop)).toEqual({ [shawl.id]: [1, true], [scarf.id]: [1, true] });
      await ordersChangedAgo(shop, '1 hour');
      await ranAgo(shop, '5 minutes');

      // The scarf comes back, the shawl is kept: the order is still delivered, and now changed.
      const scarfLine = order.items.find((item) => item.variantId === scarf.variantId)?.id;
      const back = await shop.post(`/orders/${order.id}/returns`, {
        items: [{ lineId: scarfLine, sellable: 1, damaged: 0 }],
      });
      expect(back.status, JSON.stringify(back.body)).toBe(200);
      await runTick();
      expect(await kept(shop)).toEqual({ [shawl.id]: [1, true] });
      expect(await cardFacts(shop, [shawl.id, scarf.id])).toEqual([
        { productId: shawl.id, left: null, ordered: 1, bestSeller: true },
        { productId: scarf.id, left: null, ordered: 0, bestSeller: false },
      ]);
    },
    SLOW,
  );
});

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { addMonths, DAY_MS, dhakaDate } from '../src/common/time';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson } from './support/http';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 11's backend reads (TENANT-DASHBOARD-DESIGN v2.3 §10): auto-renew's state on /me (BIL-17), the top-up
// bounds on /balance (BAL-04), an upgrade quote's period (UPG-06), Home in one read with the set-up checklist (§7.1,
// SUP-01, STF-11), the create-shop address check (AUTH-11, TEN-26), stock value by category and unit (D3-9), and
// what purchases bring (PUR-05) and when a supplier was last bought from (PUR-01). Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_dashboard_reads_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
let smallPlanId = '';
let bigPlanId = '';
let monthTermId = '';

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'dashboard-reads-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  monthTermId = await idOf(
    `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
     VALUES ('মাস', 'Reads month', 1, true, 0) RETURNING id`,
  );
  const plan = async (name: string, rank: number, price: string): Promise<string> => {
    const id = await idOf(
      'INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ($1, $2, true, $3) RETURNING id',
      name,
      rank,
      JSON.stringify({ products: 100, staff: 3, storage_mb: 100, bandwidth_gb: 10 }),
    );
    await admin.query(
      'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
      [id, monthTermId, price],
    );
    return id;
  };
  smallPlanId = await plan('Reads small', 970, '449.00');
  bigPlanId = await plan('Reads big', 971, '699.00');
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

async function idOf(sql: string, ...params: unknown[]): Promise<string> {
  return (await admin.query<{ id: string }>(sql, params)).rows[0]?.id ?? '';
}

/** A shop on the small plan for a month, bought from its balance. */
async function onStarter(): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'reads');
  await app.get(BalanceService).creditStandalone({
    tenantId: shop.tenantId,
    amount: '5000.00',
    type: LedgerEntryType.TopUp,
  });
  const purchase = app.get(PurchaseService);
  const quote = await purchase.quote(shop.tenantId, smallPlanId, monthTermId);
  await purchase.confirmFromBalance(quote.id, shop.tenantId);
  return shop;
}

async function made(
  shop: ShopClient,
  body: Record<string, unknown>,
): Promise<{ id: string; variantId: string }> {
  const result = await shop.post('/products', { basePrice: 100, ...body });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  const product = result.body as { id: string; variants: { id: string }[] };
  return { id: product.id, variantId: product.variants[0]?.id ?? '' };
}

const day = (offset: number): string => dhakaDate(new Date(Date.now() + offset * DAY_MS));

describeIfDatabase(
  'auto-renew, top-up bounds and an upgrade period (BIL-17, BAL-04, UPG-06)',
  () => {
    it("reads auto-renew's state on /me, after the switch", async () => {
      const shop = await onStarter();
      // The header's initial: the signed-in person's own name (create-shop's owner name).
      expect((await shop.get('/me')).body).toMatchObject({
        name: 'Owner',
        tenant: { autoRenewEnabled: false },
      });
      expect((await shop.post('/billing/auto-renew', { enabled: true })).status).toBe(201);
      expect((await shop.get('/me')).body).toMatchObject({ tenant: { autoRenewEnabled: true } });
    });

    it('says the top-up bounds on the balance', async () => {
      const shop = await openShop(port, texts, 'reads');
      expect((await shop.get('/balance')).body).toEqual({
        amount: '0.00',
        frozen: false,
        topUpMin: 100,
        topUpMax: 50000,
      });
    });

    it('quotes an upgrade with the period it would run were it confirmed now', async () => {
      const shop = await onStarter();
      const before = Date.now();
      const quoted = await shop.post('/billing/upgrade/quote', {
        planId: bigPlanId,
        billingTermId: monthTermId,
      });
      expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
      const { periodStart, periodEnd } = quoted.body as { periodStart: string; periodEnd: string };
      expect(Date.parse(periodStart)).toBeGreaterThanOrEqual(before - 1000);
      expect(Date.parse(periodStart)).toBeLessThanOrEqual(Date.now());
      expect(periodEnd).toBe(addMonths(new Date(periodStart), 1).toISOString());
    });
  },
);

describeIfDatabase('Home in one read (TENANT-DASHBOARD-DESIGN §7.1, SUP-01, STF-11)', () => {
  it("counts the owner's jobs and ticks the checklist", async () => {
    const shop = await openShop(port, texts, 'home');
    // Two in stock, low, out (thresholds 5), one inactive low, one archived; a batch expiring in 10 days, and an
    // archived product's batch expiring too, which counts nowhere (KNOWN-GAPS: the list's total counted it).
    await made(shop, { name: 'Plenty', variants: [{ optionIds: [], openingStock: 20 }] });
    await made(shop, { name: 'Few', variants: [{ optionIds: [], openingStock: 2 }] });
    await made(shop, { name: 'None', variants: [{ optionIds: [], openingStock: 0 }] });
    await made(shop, {
      name: 'Resting',
      active: false,
      variants: [{ optionIds: [], openingStock: 1 }],
    });
    const gone = await made(shop, { name: 'Gone', variants: [{ optionIds: [], openingStock: 1 }] });
    await made(shop, {
      name: 'Cream',
      batchTracked: true,
      variants: [
        { optionIds: [], openingStock: 9, openingBatch: { batchCode: 'C1', expiresOn: day(10) } },
      ],
    });
    const oldCream = await made(shop, {
      name: 'Old cream',
      batchTracked: true,
      variants: [
        { optionIds: [], openingStock: 9, openingBatch: { batchCode: 'C0', expiresOn: day(5) } },
      ],
    });
    expect((await shop.delete(`/products/${gone.id}`)).status).toBe(200);
    expect((await shop.delete(`/products/${oldCream.id}`)).status).toBe(200);
    // A top-up and a plan payment sent, waiting for the operator.
    const topUp = (await shop.post('/balance/top-up/quote', { amount: 500 })).body as {
      id: string;
    };
    expect(
      (
        await shop.post('/balance/top-up/confirm', {
          paymentId: topUp.id,
          transactionId: `TX${randomUUID().slice(0, 8)}`,
          senderNumber: '01711000000',
          amountPaid: 500,
        })
      ).status,
    ).toBe(201);
    const plan = (
      await shop.post('/billing/quote', { planId: smallPlanId, billingTermId: monthTermId })
    ).body as { id: string; amount: string };
    expect(
      (
        await shop.post('/billing/purchase', {
          paymentId: plan.id,
          method: 'wallet',
          transactionId: `TX${randomUUID().slice(0, 8)}`,
          senderNumber: '01711000000',
          amountPaid: Number(plan.amount),
        })
      ).status,
    ).toBe(201);

    const home = (await shop.get('/home')).body as Record<string, unknown>;
    expect(home).toMatchObject({
      products: { total: 5, active: 4 },
      stock: { low: 1, out: 1, expiringBatches: 1 },
      balance: { amount: '0.00', low: true, freeSms: { used: expect.any(Number) as unknown } },
      topUpsBeingChecked: { count: 1, amount: '500.00' },
      paymentsBeingChecked: { count: 1, amount: plan.amount },
      staffWithoutPassword: 0,
      fastSpendAlertedAt: null,
      checklist: {
        deliveryCharges: { inside: '70.00', outside: '130.00' },
        firstProduct: true,
        logo: false,
        linkShared: false,
        apiKey: false,
      },
    });
    // GET /batches' total agrees with its rows: the archived product's batch is in neither.
    const batches = (await shop.get('/batches?state=expiring')).body as {
      batches: unknown[];
      total: number;
    };
    expect(batches.total).toBe(batches.batches.length);

    expect((await shop.post('/home/link-shared', {})).status).toBe(200);
    expect(
      (await shop.post('/api-keys', { name: 'Website', websites: ['https://example.com'] })).status,
    ).toBe(201);
    expect(((await shop.get('/home')).body as { checklist: unknown }).checklist).toMatchObject({
      linkShared: true,
      apiKey: true,
    });
  });

  it('shows a staff member only what their permissions reach, never the checklist', async () => {
    const shop = await openShop(port, texts, 'home');
    const headers = await staffWith(port, texts, admin, shop, ['products:read']);
    const home = await getJson(port, '/home', headers);
    expect(home.status).toBe(200);
    expect(home.body).toEqual({
      products: { total: 0, active: 0 },
      stock: null,
      balance: null,
      topUpsBeingChecked: null,
      paymentsBeingChecked: null,
      staffWithoutPassword: null,
      fastSpendAlertedAt: null,
      checklist: null,
    });
    // AUTH-31: the owner sees a staff member who has not chosen a password yet -- until they do. (A seat for them.)
    await admin.query(
      `UPDATE control.tenants SET plan_snapshot = jsonb_set(plan_snapshot, '{staff}', '5') WHERE id = $1`,
      [shop.tenantId],
    );
    const fresh = await shop.post('/staff', {
      phone: texts.freshPhone(),
      password: 'first-pass-2468',
    });
    expect(fresh.status).toBe(201);
    expect((await shop.get('/home')).body).toMatchObject({ staffWithoutPassword: 1 });
  });
});

describeIfDatabase('the create-shop address check (AUTH-11, TEN-26)', () => {
  it('says whether an address is free, and offers the next free one when not', async () => {
    const shop = await openShop(port, texts, 'address');
    const check = async (address: string) =>
      (await shop.get(`/shops/address-check?address=${encodeURIComponent(address)}`)).body;
    const free = `free-${randomUUID().slice(0, 8)}`;
    expect(await check(free)).toEqual({
      available: true,
      address: free,
      reason: null,
      suggestion: null,
    });
    // Taken and reserved answer alike, each with the next free address from the same base.
    expect(await check(shop.slug)).toEqual({
      available: false,
      address: null,
      reason: 'unavailable',
      suggestion: `${shop.slug}-2`,
    });
    expect(await check('admin')).toMatchObject({ available: false, reason: 'unavailable' });
    expect(await check('Not An Address!')).toEqual({
      available: false,
      address: null,
      reason: 'format',
      suggestion: null,
    });
  });

  it('holds an account to sixty checks a minute, and asks a session', async () => {
    const shop = await openShop(port, texts, 'address');
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await shop.get(`/shops/address-check?address=try-${String(attempt)}`)).status).toBe(
        200,
      );
    }
    const refused = await shop.get('/shops/address-check?address=one-more');
    expect(refused.status).toBe(429);
    expect(errorOf(refused).code).toBe('rate_limited');
    expect(
      (await getJson(port, '/shops/address-check?address=anyone', { host: 'localhost' })).status,
    ).toBe(401);
  });
});

describeIfDatabase(
  'stock value by category and unit, and what purchases bring (D3-9, PUR-01, PUR-05)',
  () => {
    it('splits the stock value by top-level category, each with its amounts by unit', async () => {
      const shop = await openShop(port, texts, 'value');
      const clothing = (await shop.post('/categories', { name: 'Clothing' })).body as {
        id: string;
      };
      const panjabi = (await shop.post('/categories', { name: 'Panjabi', parentId: clothing.id }))
        .body as { id: string };
      const food = (await shop.post('/categories', { name: 'Food' })).body as { id: string };
      const costed = async (body: Record<string, unknown>, cost: number) => {
        const product = await made(shop, body);
        await shop.put(`/products/${product.id}/variants/${product.variantId}/cost`, {
          avgCost: cost,
        });
      };
      await costed(
        {
          name: 'Kurta',
          categoryIds: [panjabi.id],
          variants: [{ optionIds: [], openingStock: 4 }],
        },
        100,
      );
      await costed(
        {
          name: 'Shawl',
          categoryIds: [clothing.id],
          variants: [{ optionIds: [], openingStock: 1 }],
        },
        50,
      );
      await costed(
        {
          name: 'Rice',
          categoryIds: [food.id],
          stockUnit: 'kg',
          variants: [{ optionIds: [], openingStock: 2.5 }],
        },
        60,
      );
      await costed({ name: 'Loose', variants: [{ optionIds: [], openingStock: 3 }] }, 10);

      const figures = (await shop.get('/inventory/figures')).body as { stockValue: unknown };
      expect(figures.stockValue).toEqual({
        value: '630.00',
        unknownCost: 0,
        units: [
          { unit: 'piece', quantity: '8.000' },
          { unit: 'kg', quantity: '2.500' },
        ],
        byCategory: [
          {
            categoryId: clothing.id,
            name: 'Clothing',
            value: '450.00',
            unknownCost: 0,
            units: [{ unit: 'piece', quantity: '5.000' }],
          },
          {
            categoryId: food.id,
            name: 'Food',
            value: '150.00',
            unknownCost: 0,
            units: [{ unit: 'kg', quantity: '2.500' }],
          },
          {
            categoryId: null,
            name: null,
            value: '30.00',
            unknownCost: 0,
            units: [{ unit: 'piece', quantity: '3.000' }],
          },
        ],
      });
    });

    it("lists each purchase's units and what is still coming, and when a supplier was last bought from", async () => {
      const shop = await openShop(port, texts, 'coming');
      const kurta = await made(shop, {
        name: 'Kurta',
        variants: [{ optionIds: [], openingStock: 0 }],
      });
      const rice = await made(shop, {
        name: 'Rice',
        stockUnit: 'kg',
        variants: [{ optionIds: [], openingStock: 0 }],
      });
      const rahim = (await shop.post('/suppliers', { name: 'Rahim Traders' })).body as {
        id: string;
      };
      const karim = (await shop.post('/suppliers', { name: 'Karim Garments' })).body as {
        id: string;
      };
      const draft = async (supplierId: string, items: Record<string, unknown>[]) => {
        const result = await shop.post('/purchase-orders', { supplierId, items });
        expect(result.status, JSON.stringify(result.body)).toBe(201);
        return result.body as { id: string; items: { id: string; variantId: string }[] };
      };
      // A draft is not coming; a placed one partly received is; a cancelled one is neither, nor a purchase.
      await draft(rahim.id, [{ variantId: kurta.variantId, quantity: 5 }]);
      const open = await draft(rahim.id, [
        { variantId: kurta.variantId, quantity: 10 },
        { variantId: rice.variantId, quantity: 5 },
      ]);
      const placed = (await shop.post(`/purchase-orders/${open.id}/place`, {})).body as {
        orderedAt: string;
      };
      const kurtaItem = open.items.find((item) => item.variantId === kurta.variantId)?.id ?? '';
      expect(
        (
          await shop.post(`/purchase-orders/${open.id}/receipts`, {
            items: [{ itemId: kurtaItem, accepted: 4 }],
          })
        ).status,
      ).toBe(201);
      const dropped = await draft(karim.id, [{ variantId: kurta.variantId, quantity: 7 }]);
      await shop.post(`/purchase-orders/${dropped.id}/place`, {});
      expect((await shop.post(`/purchase-orders/${dropped.id}/cancel`, {})).status).toBe(200);

      const list = (await shop.get('/purchase-orders')).body as {
        purchaseOrders: { id: string; status: string; units: unknown; outstanding: unknown }[];
        coming: unknown;
      };
      expect(list.purchaseOrders.find((row) => row.id === open.id)).toMatchObject({
        status: 'partially_received',
        units: [
          { unit: 'piece', quantity: '10.000' },
          { unit: 'kg', quantity: '5.000' },
        ],
        outstanding: [
          { unit: 'piece', quantity: '6.000' },
          { unit: 'kg', quantity: '5.000' },
        ],
      });
      expect(list.purchaseOrders.find((row) => row.status === 'draft')).toMatchObject({
        units: [{ unit: 'piece', quantity: '5.000' }],
        outstanding: [],
      });
      expect(list.coming).toEqual({
        units: [
          { unit: 'piece', quantity: '6.000' },
          { unit: 'kg', quantity: '5.000' },
        ],
        purchases: 1,
      });

      const suppliers = (await shop.get('/suppliers')).body as {
        suppliers: { id: string; lastPurchaseAt: string | null }[];
      };
      expect(suppliers.suppliers.find((row) => row.id === rahim.id)?.lastPurchaseAt).toBe(
        placed.orderedAt,
      );
      expect(suppliers.suppliers.find((row) => row.id === karim.id)?.lastPurchaseAt).toBeNull();
    });
  },
);

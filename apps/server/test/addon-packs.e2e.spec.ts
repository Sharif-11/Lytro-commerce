import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { AddonPackService } from '../src/modules/billing/services/addon-pack.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { MEDIA_CLOCK, MEDIA_STORAGE } from '../src/modules/media/tokens';
import { ApiKeyAuthenticator } from '../src/modules/public-api/services/api-key-authenticator';
import { RequestQuota } from '../src/modules/public-api/services/request-quota';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { UsageNoticeSender } from '../src/modules/usage/services/usage-notice-sender';
import type { PackAutoBuy } from '../src/modules/usage-warnings/types/pack-auto-buy';
import type { UsageNotice } from '../src/modules/usage-warnings/types/usage-notice';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 10a.3: request packs. Bought from the balance in one tap (PLN-15); a cycle's use past the shop's own
// limit is taken from its packs and what is left carries over (RTE-11); a pack bought in the grace adds its full amount
// on top of what is used; auto-buy at the allowance, three a cycle, and what a short balance does (PLN-15); the stop at
// the allowance and the grace of the shop's own limit (RTE-03); a limit add-on the API holds the shop to as the page
// does (KNOWN-GAPS §87); and what the usage page, its notices and its suggestions say of packs (LIM-01). Bandwidth's
// packs were retired with the media Worker (D9-31). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_addon_packs_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const MINUTE_MS = 60 * 1000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const clockMs = Date.now() + 10 * MINUTE_MS;
let smallPlanId = '';
let smallTermId = '';
const ran = new Set<number>();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'addon-packs-e2e-otp-secret-0123456789abc';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const plan = async (name: string, rank: number, limits: object, price: string) => {
    const planId =
      (
        await admin.query<{ id: string }>(
          `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ($1, $2, true, $3) RETURNING id`,
          [name, rank, JSON.stringify(limits)],
        )
      ).rows[0]?.id ?? '';
    const termId =
      (
        await admin.query<{ id: string }>(
          `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
           VALUES ('মাস', $1, 1, true, 0) RETURNING id`,
          [`${name} month`],
        )
      ).rows[0]?.id ?? '';
    await admin.query(
      'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
      [planId, termId, price],
    );
    return { planId, termId };
  };
  ({ planId: smallPlanId, termId: smallTermId } = await plan(
    'Small',
    980,
    { products: 10, staff: 2, storage_mb: 10, requests_monthly: 10 },
    '449.00',
  ));
  await plan(
    'Big',
    981,
    { products: 1000, staff: 5, storage_mb: 5000, requests_monthly: 100_000 },
    '699.00',
  );
  // A pack small enough to reach in a test, in place of the seeded one. Migration 0137 retired the bandwidth pack.
  await admin.query("UPDATE control.addons SET retired_at = now() WHERE key = 'request_pack'");
  await admin.query(
    `INSERT INTO control.addons (key, kind, limit_key, unit_size, price, label_en, label_bn) VALUES
       ('test_request_pack', 'pack', 'requests_monthly', 10, 5, 'Request pack', 'রিকোয়েস্ট প্যাক')`,
  );
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(new MemoryStorage())
    .overrideProvider(MEDIA_CLOCK)
    .useValue(() => new Date(clockMs))
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** A shop that bought Small from its balance, its period then moved to 10 of 30 days gone, with an owner's email. */
async function onSmall(balance = '5000.00'): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'packs');
  await app.get(BalanceService).creditStandalone({
    tenantId: shop.tenantId,
    amount: balance,
    type: LedgerEntryType.TopUp,
  });
  const purchase = app.get(PurchaseService);
  const quote = await purchase.quote(shop.tenantId, smallPlanId, smallTermId);
  await purchase.confirmFromBalance(quote.id, shop.tenantId);
  await admin.query(
    `UPDATE control.tenants SET period_start = date_trunc('second', now()) - interval '10 days',
       period_end = date_trunc('second', now()) + interval '20 days' WHERE id = $1`,
    [shop.tenantId],
  );
  await admin.query(
    `UPDATE tenant.users SET email = $2, language = 'en' WHERE tenant_id = $1 AND is_owner`,
    [shop.tenantId, `owner.${shop.tenantId.slice(0, 8)}@example.com`],
  );
  return shop;
}

async function addonId(key: string): Promise<string> {
  return (
    (await admin.query<{ id: string }>('SELECT id FROM control.addons WHERE key = $1', [key]))
      .rows[0]?.id ?? ''
  );
}

async function buyPacks(shop: ShopClient, key: string, quantity = 1) {
  const bought = await shop.post('/addons/packs', { addonId: await addonId(key), quantity });
  expect(bought.status, JSON.stringify(bought.body)).toBe(201);
  return bought.body as { invoice: { kind: string; periodStart: string | null; lines: unknown[] } };
}

/** The shop's keys make `count` API requests now; how many were let through. Then the minute's flush. */
async function request(shop: ShopClient, count: number): Promise<number> {
  const api = await app.get(ApiKeyAuthenticator).shopOf(shop.tenantId);
  if (!api) throw new Error('no shop');
  let served = 0;
  for (let index = 0; index < count; index += 1) {
    if (await app.get(RequestQuota).take(api, new Date())) served += 1;
  }
  await app.get(RequestQuota).flush();
  return served;
}

/** Runs the pack jobs queued for the shop, as the pack worker would. How many. */
async function runAutoBuys(shop: ShopClient): Promise<number> {
  const jobs = await admin.query<{ id: number; payload: PackAutoBuy }>(
    `SELECT id, payload FROM control.job_outbox WHERE queue_name = 'pack_auto_buy' AND payload->>'tenantId' = $1
     ORDER BY id`,
    [shop.tenantId],
  );
  let count = 0;
  for (const job of jobs.rows) {
    if (ran.has(job.id)) continue;
    ran.add(job.id);
    await app.get(AddonPackService).autoBuy(job.payload);
    count += 1;
  }
  return count;
}

async function requestCycle(shop: ShopClient) {
  const row = await admin.query<{
    requests: string;
    pack_used: string;
    pack_free: string;
    auto_packs: number;
    auto_buy_state: string | null;
    warned_percent: number;
  }>(
    `SELECT requests, pack_used, pack_free, auto_packs, auto_buy_state, warned_percent
     FROM control.api_usage WHERE tenant_id = $1 ORDER BY cycle_start DESC LIMIT 1`,
    [shop.tenantId],
  );
  return row.rows[0];
}

async function requestsFigure(shop: ShopClient) {
  const usage = await shop.get('/usage');
  expect(usage.status, JSON.stringify(usage.body)).toBe(200);
  return (usage.body as { metrics: { metric: string }[] }).metrics.find(
    (metric) => metric.metric === 'requests',
  );
}

async function mailTo(shop: ShopClient): Promise<{ subject: string; body: string }[]> {
  return (
    await admin.query<{ subject: string; body: string }>(
      'SELECT subject, body FROM control.mail_outbox WHERE to_email = $1 ORDER BY created_at',
      [`owner.${shop.tenantId.slice(0, 8)}@example.com`],
    )
  ).rows;
}

describeIfDatabase('buying packs in one tap (PLN-15, BIL-12)', () => {
  it('charges the balance at once, invoices them, and adds them to the allowance', async () => {
    const shop = await onSmall();
    const offers = (await shop.get('/addons')).body as {
      addon: { key: string };
      price: number | null;
      expiresAt: string | null;
    }[];
    expect(offers.find((offer) => offer.addon.key === 'test_request_pack')).toMatchObject({
      price: 5,
      expiresAt: null,
    });
    const bought = await buyPacks(shop, 'test_request_pack', 2);
    expect(bought.invoice).toMatchObject({
      kind: 'addon',
      periodStart: null,
      lines: [{ kind: 'addon', description: 'Request pack', quantity: 2, amount: '10.00' }],
    });
    const ledger = await admin.query<{ type: string; amount: string }>(
      'SELECT type, amount FROM tenant.balance_ledger WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
      [shop.tenantId],
    );
    expect(ledger.rows[0]).toEqual({ type: 'addon', amount: '-10.00' });
    expect(await requestsFigure(shop)).toMatchObject({ limit: 30, packLeft: 20 });
    const mine = (await shop.get('/addons/mine')).body as { packs: unknown[] };
    expect(mine.packs).toEqual([{ metric: 'requests', left: 20, autoBuy: false }]);
    // A pack has no quote to hold.
    const quoted = await shop.post('/addons/quote', {
      addonId: await addonId('test_request_pack'),
    });
    expect(quoted.status).toBe(404);
  });

  it('no longer sells the bandwidth pack (D9-31)', async () => {
    const shop = await onSmall();
    const offers = (await shop.get('/addons')).body as { addon: { limitKey: string | null } }[];
    expect(offers.some((offer) => offer.addon.limitKey === 'bandwidth_gb')).toBe(false);
    const refused = await shop.post('/addons/packs', { addonId: await addonId('bandwidth_pack') });
    expect(refused.status).toBe(404);
  });

  it('refuses packs whose price changed since it was shown, charging nothing (BIL-09, Slice 11.5c)', async () => {
    const shop = await onSmall();
    const id = await addonId('test_request_pack');
    const offers = (await shop.get('/addons')).body as {
      addon: { key: string };
      amounts: number[];
      daysLeft: number | null;
    }[];
    // A pack's price is whole, so each quantity is that many of it.
    expect(
      offers.find((offer) => offer.addon.key === 'test_request_pack')?.amounts.slice(0, 3),
    ).toEqual([5, 10, 15]);
    const before = ((await shop.get('/balance')).body as { amount: string }).amount;
    const changed = await shop.post('/addons/packs', { addonId: id, quantity: 2, amount: 8 });
    expect(changed.status).toBe(409);
    expect(errorOf(changed)).toMatchObject({ code: 'conflict', details: { amount: '10.00' } });
    expect(((await shop.get('/balance')).body as { amount: string }).amount).toBe(before);
    const bought = await shop.post('/addons/packs', { addonId: id, quantity: 2, amount: 10 });
    expect(bought.status, JSON.stringify(bought.body)).toBe(201);
  });

  it('sells a trial shop no pack', async () => {
    const trial = await openShop(port, texts, 'packs');
    const refused = await trial.post('/addons/packs', {
      addonId: await addonId('test_request_pack'),
    });
    expect(refused.status).toBe(402);
    expect(errorOf(refused).code).toBe('plan_feature_unavailable');
  });
});

describeIfDatabase('packs taken by what a cycle uses, and carried over (RTE-11)', () => {
  it("carries a request pack's rest into the next cycle", async () => {
    const shop = await onSmall();
    await buyPacks(shop, 'test_request_pack');
    // 15 requests on a limit of 10 and a pack of 10: five taken.
    expect(await request(shop, 15)).toBe(15);
    expect(Number((await requestCycle(shop))?.pack_used)).toBe(5);
    expect(await requestsFigure(shop)).toMatchObject({
      used: 15,
      limit: 20,
      packLeft: 5,
      stopAt: 21,
    });
    // A new cycle: the five left are its own, on top of its own limit.
    await admin.query(
      "UPDATE control.tenants SET period_start = now() - interval '1 hour' WHERE id = $1",
      [shop.tenantId],
    );
    expect(await requestsFigure(shop)).toMatchObject({
      used: 0,
      limit: 15,
      packLeft: 5,
      stopAt: 16,
    });
  });

  it('adds a pack bought in the grace on top of what is used: the grace use stays free', async () => {
    const shop = await onSmall();
    // 11 of 10: in the grace.
    expect(await request(shop, 11)).toBe(11);
    await buyPacks(shop, 'test_request_pack');
    const cycle = await requestCycle(shop);
    expect(Number(cycle?.pack_free)).toBe(1);
    // 11 of a new allowance of 21: the warnings start again from half.
    expect(cycle?.warned_percent).toBe(50);
    expect(await request(shop, 10)).toBe(10);
    expect(Number((await requestCycle(shop))?.pack_used)).toBe(10);
  });
});

describeIfDatabase('auto-buy (RTE-11, PLN-15)', () => {
  it('buys one pack at the allowance, three a cycle at most, and tells the owner each time', async () => {
    const shop = await onSmall();
    const on = await shop.patch('/addons/auto-buy', { requests: true });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(on.body).toEqual([{ metric: 'requests', left: 0, autoBuy: true }]);
    for (let round = 1; round <= 3; round += 1) {
      expect(await request(shop, 10)).toBe(10);
      expect(await runAutoBuys(shop)).toBe(1);
      expect(await requestCycle(shop)).toMatchObject({ auto_packs: round, auto_buy_state: null });
    }
    // The cap is reached: the fourth allowance asks for none, and the grace and the stop apply.
    expect(await request(shop, 10)).toBe(10);
    expect(await runAutoBuys(shop)).toBe(0);
    expect(await request(shop, 5)).toBe(1);
    const mail = await mailTo(shop);
    expect(mail.filter((each) => each.subject === 'Auto-buy bought a pack')).toHaveLength(3);
    expect(mail.find((each) => each.subject === 'Auto-buy bought a pack')?.body).toContain(
      'Auto-buy bought a Request pack for 5 TK from your balance (1 of 3 this cycle).',
    );
  });

  it('stops asking when the balance is short, says so, and asks again once a pack is bought', async () => {
    const shop = await onSmall('449.00');
    await shop.patch('/addons/auto-buy', { requests: true });
    expect(await request(shop, 10)).toBe(10);
    await runAutoBuys(shop);
    expect(await requestCycle(shop)).toMatchObject({ auto_packs: 0, auto_buy_state: 'failed' });
    const failed = await admin.query(
      "SELECT 1 FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'pack_auto_buy_failed'",
      [shop.tenantId],
    );
    expect(failed.rows).toHaveLength(1);
    expect((await mailTo(shop)).map((each) => each.subject)).toContain(
      'Auto-buy could not buy a pack',
    );
    await request(shop, 1);
    expect(await runAutoBuys(shop)).toBe(0);

    await app.get(BalanceService).creditStandalone({
      tenantId: shop.tenantId,
      amount: '100.00',
      type: LedgerEntryType.TopUp,
    });
    await buyPacks(shop, 'test_request_pack');
    expect((await requestCycle(shop))?.auto_buy_state).toBeNull();
  });

  it("buys nothing for a bandwidth pack's job queued before D9-31", async () => {
    const shop = await onSmall();
    await shop.patch('/addons/auto-buy', { requests: true });
    // As the queue holds it: JSON, its metric a value the enum no longer has.
    const job = JSON.parse(
      JSON.stringify({ tenantId: shop.tenantId, metric: 'bandwidth', cycleStart: new Date() }),
    ) as PackAutoBuy;
    await app.get(AddonPackService).autoBuy(job);
    const bought = await admin.query('SELECT 1 FROM control.addon_purchases WHERE tenant_id = $1', [
      shop.tenantId,
    ]);
    expect(bought.rows).toHaveLength(0);
  });

  it('takes the request switch, and logs it', async () => {
    const shop = await onSmall();
    expect((await shop.patch('/addons/auto-buy', {})).status).toBe(400);
    expect((await shop.patch('/addons/auto-buy', { bandwidth: true })).status).toBe(400);
    expect((await shop.patch('/addons/auto-buy', { requests: true })).status).toBe(200);
    const logged = await admin.query(
      "SELECT 1 FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'pack_auto_buy_set'",
      [shop.tenantId],
    );
    expect(logged.rows).toHaveLength(1);
  });
});

/** The shop buys one of a new limit add-on from its balance, for 30 days. */
async function buyLimitAddon(shop: ShopClient, limitKey: string, unitSize: number): Promise<void> {
  const extra = await admin.query<{ id: string }>(
    `INSERT INTO control.addons (key, kind, limit_key, unit_size, price, label_en, label_bn)
     VALUES ($1, 'limit', $2, $3, 9, 'Extra room', 'এক্সট্রা জায়গা') RETURNING id`,
    [`extra_${randomUUID().slice(0, 8)}`, limitKey, unitSize],
  );
  const quote = await shop.post('/addons/quote', { addonId: extra.rows[0]?.id });
  const paid = await shop.post('/addons/purchase', {
    paymentId: (quote.body as { payment: { id: string } }).payment.id,
  });
  expect(paid.status, JSON.stringify(paid.body)).toBe(201);
}

describeIfDatabase('one limit for the page and the API (KNOWN-GAPS §87)', () => {
  it('holds the API to a request limit add-on, as the usage page shows it', async () => {
    const shop = await onSmall();
    await buyLimitAddon(shop, 'requests_monthly', 10);
    expect(await requestsFigure(shop)).toMatchObject({ limit: 20, stopAt: 22 });
    // Its own 20 and the grace of 10% of them: 22 served, the 23rd refused.
    expect(await request(shop, 23)).toBe(22);
  });
});

describeIfDatabase('what the usage page and its notices say of packs (LIM-01, PLN-15)', () => {
  it('offers the pack in one tap at the limit, and auto-buy', async () => {
    const shop = await onSmall();
    expect(await request(shop, 10)).toBe(10);
    const notices = await admin.query<{ payload: UsageNotice }>(
      `SELECT payload FROM control.job_outbox WHERE queue_name = 'usage_notice' AND payload->>'tenantId' = $1
       AND payload->>'level' = '100'`,
      [shop.tenantId],
    );
    const notice = notices.rows[0]?.payload;
    if (!notice) throw new Error('no 100% notice');
    await app.get(UsageNoticeSender).send(notice);
    const mail = await mailTo(shop);
    expect(mail.at(-1)?.body).toContain(
      'Buy a Request pack for 5 TK from your dashboard in one tap, or switch on auto-buy.',
    );
  });

  it('leads with the next plan once packs were bought two cycles running', async () => {
    const shop = await onSmall();
    // 9 of 10: near the limit.
    expect(await request(shop, 9)).toBe(9);
    const near = (await shop.get('/usage')).body as { suggestions: { first: { kind: string } } };
    expect(near.suggestions.first.kind).toBe('addons');
    // Packs bought last cycle and this one.
    await buyPacks(shop, 'test_request_pack');
    await admin.query(
      `UPDATE control.addon_purchases SET purchased_at = now() - interval '35 days'
       WHERE id = (SELECT id FROM control.addon_purchases WHERE tenant_id = $1 ORDER BY purchased_at LIMIT 1)`,
      [shop.tenantId],
    );
    await buyPacks(shop, 'test_request_pack');
    // 26 of the 30 its limit and two packs allow: near again.
    expect(await request(shop, 17)).toBe(17);
    const again = (await shop.get('/usage')).body as {
      suggestions: { first: { kind: string; name?: string }; alternative: { kind: string } | null };
    };
    expect(again.suggestions.first).toMatchObject({ kind: 'plan', name: 'Big' });
    expect(again.suggestions.alternative?.kind).toBe('addons');
  });
});

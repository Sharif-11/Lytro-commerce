import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { dhakaDate } from '../src/common/time';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { DowngradeService } from '../src/modules/billing/services/downgrade.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { UpgradeService } from '../src/modules/billing/services/upgrade.service';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, patchJson, postJson, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 10a.1: the add-on catalogue (PLN-13); buying an add-on from the balance into the running period, its
// invoice, and the limit it raises everywhere at once (PLN-14, BIL-08, BIL-12); brand identity bought once (BRN-05);
// the add-ons the usage suggestion offers (LIM-01); and the downgrade judged by the shop's own limits (DWN-08,
// DWN-12, KNOWN-GAPS §85). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_addons_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const PASSWORD = 'correct-horse-9';
const STAFF_PASSWORD = 'staff-pass-2468';
const BCRYPT_TIMEOUT_MS = 30_000;

interface Addon {
  id: string;
  key: string;
  kind: string;
  price: string;
  retiredAt: string | null;
}

interface Offer {
  addon: Addon;
  price: number | null;
  expiresAt: string | null;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const storage = new MemoryStorage();
let smallPlanId = '';
let smallTermId = '';
let bigPlanId = '';
let bigTermId = '';

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'addons-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const plan = async (
    name: string,
    rank: number,
    limits: object,
    price: string,
  ): Promise<{ planId: string; termId: string }> => {
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
    950,
    { products: 1, staff: 2, storage_mb: 1 },
    '449.00',
  ));
  ({ planId: bigPlanId, termId: bigTermId } = await plan(
    'Big',
    951,
    { products: 1000, staff: 5, storage_mb: 5000 },
    '699.00',
  ));
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/**
 * A shop that bought this plan from its balance (a real invoice), its period then moved to 10 of 30 days gone -- the
 * invoice's with it -- so every price below is a known share of a month.
 */
async function onPaidPlan(
  planId: string,
  termId: string,
  balance = '5000.00',
): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'addons');
  await app.get(BalanceService).creditStandalone({
    tenantId: shop.tenantId,
    amount: balance,
    type: LedgerEntryType.TopUp,
  });
  const purchase = app.get(PurchaseService);
  const quote = await purchase.quote(shop.tenantId, planId, termId);
  await purchase.confirmFromBalance(quote.id, shop.tenantId);
  for (const table of ['tenants', 'invoices']) {
    await admin.query(
      `UPDATE control.${table} SET period_start = date_trunc('second', now()) - interval '10 days',
         period_end = date_trunc('second', now()) + interval '20 days'
       WHERE ${table === 'tenants' ? 'id' : 'tenant_id'} = $1`,
      [shop.tenantId],
    );
  }
  return shop;
}

async function offersOf(shop: ShopClient): Promise<Offer[]> {
  const answer = await shop.get('/addons');
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.body as Offer[];
}

async function addonId(key: string): Promise<string> {
  const row = await admin.query<{ id: string }>('SELECT id FROM control.addons WHERE key = $1', [
    key,
  ]);
  return row.rows[0]?.id ?? '';
}

/** Quotes and pays an add-on; the purchase's answer. */
async function buy(shop: ShopClient, key: string, quantity = 1): Promise<HttpResult> {
  const quote = await shop.post('/addons/quote', { addonId: await addonId(key), quantity });
  expect(quote.status, JSON.stringify(quote.body)).toBe(201);
  const paymentId = (quote.body as { payment: { id: string } }).payment.id;
  return shop.post('/addons/purchase', { paymentId });
}

async function balanceOf(shop: ShopClient): Promise<string> {
  return ((await shop.get('/balance')).body as { amount: string }).amount;
}

async function makeProduct(shop: ShopClient, name: string): Promise<HttpResult> {
  return shop.post('/products', { name, basePrice: 100, variants: [{ optionIds: [] }] });
}

async function operatorHeaders(): Promise<Record<string, string>> {
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, await hash(PASSWORD, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', { email, password: PASSWORD });
  const code = await generate({ secret: (signedIn.body as { secret: string }).secret });
  const enrolled = await postJson(port, '/auth/operator/enroll', {
    email,
    password: PASSWORD,
    code,
  });
  return {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
}

describeIfDatabase('the add-on catalogue (PLN-13, ADM-08)', () => {
  it(
    'lists the seeded items, adds, edits and retires one, each in the platform audit log',
    async () => {
      const operator = await operatorHeaders();
      const listed = await getJson(port, '/operator/addons', operator);
      expect(listed.status).toBe(200);
      expect((listed.body as Addon[]).map((addon) => [addon.key, addon.kind, addon.price])).toEqual(
        expect.arrayContaining([
          ['extra_products', 'limit', '149.00'],
          ['extra_seat', 'limit', '49.00'],
          ['extra_storage', 'limit', '29.00'],
          ['brand_identity', 'feature', '149.00'],
          ['bandwidth_pack', 'pack', '30.00'],
          ['request_pack', 'pack', '20.00'],
        ]),
      );

      const item = {
        key: 'extra_devices',
        kind: 'limit',
        limitKey: 'paired_devices',
        unitSize: 1,
        price: 39,
        labelEn: 'Extra device',
        labelBn: 'এক্সট্রা ডিভাইস',
      };
      const created = await postJson(port, '/operator/addons', item, operator);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const id = (created.body as Addon).id;
      // One key names one item.
      const again = await postJson(port, '/operator/addons', item, operator);
      expect(again.status).toBe(400);
      expect(fieldsOf(again)).toEqual({ key: 'taken' });
      // A feature raises no limit.
      const feature = await postJson(
        port,
        '/operator/addons',
        { ...item, key: 'chat_widget', kind: 'feature' },
        operator,
      );
      expect(feature.status).toBe(400);
      expect(Object.keys(fieldsOf(feature)).sort()).toEqual(['limitKey', 'unitSize']);

      const edited = await patchJson(port, `/operator/addons/${id}`, { price: 45 }, operator);
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect((edited.body as Addon).price).toBe('45.00');
      const retired = await postJson(port, `/operator/addons/${id}/retire`, {}, operator);
      expect(retired.status).toBe(200);
      expect((retired.body as Addon).retiredAt).not.toBeNull();

      const logged = await admin.query<{ action: string }>(
        "SELECT action FROM control.platform_audit_log WHERE target_type = 'addon' AND target_id = $1 ORDER BY created_at",
        [id],
      );
      expect(logged.rows.map((row) => row.action)).toEqual([
        'addon_created',
        'addon_updated',
        'addon_retired',
      ]);

      // Retired, it is no longer for sale to a shop.
      const shop = await onPaidPlan(smallPlanId, smallTermId);
      expect((await offersOf(shop)).map((offer) => offer.addon.key)).not.toContain('extra_devices');
      const quote = await shop.post('/addons/quote', { addonId: id });
      expect(quote.status).toBe(404);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it('keeps the catalogue to operators', async () => {
    const shop = await openShop(port, texts, 'addons');
    const tried = await getJson(port, '/operator/addons', shop.headers());
    expect(tried.status).toBe(401);
  });
});

describeIfDatabase('buying an add-on from the balance (PLN-14, BIL-08, BIL-12)', () => {
  it('offers a trial shop nothing at a price', async () => {
    const shop = await openShop(port, texts, 'addons');
    const offers = await offersOf(shop);
    expect(offers.map((offer) => offer.addon.key).sort()).toEqual([
      'bandwidth_pack',
      'brand_identity',
      'extra_products',
      'extra_seat',
      'extra_storage',
      'request_pack',
    ]);
    expect(offers.every((offer) => offer.price === null && offer.expiresAt === null)).toBe(true);
    const quote = await shop.post('/addons/quote', { addonId: await addonId('extra_seat') });
    expect(quote.status).toBe(402);
    expect(errorOf(quote).code).toBe('plan_feature_unavailable');
  });

  it('prices it to the period end, charges the balance, invoices it and raises the limit at once', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    const periodEnd = (
      await admin.query<{ period_end: Date }>(
        'SELECT period_end FROM control.tenants WHERE id = $1',
        [shop.tenantId],
      )
    ).rows[0]?.period_end;

    // 149 a month, 20 of 30 days left: 99.33 for one.
    const offer = (await offersOf(shop)).find((each) => each.addon.key === 'extra_products');
    expect(offer).toMatchObject({ price: 99, expiresAt: periodEnd?.toISOString() });

    expect((await makeProduct(shop, 'First')).status).toBe(201);
    const refused = await makeProduct(shop, 'Second');
    expect(refused.status).toBe(402);
    // LIM-01: the refusal offers the add-on first -- 449 + 149 a month, under Big's 699 -- and Big beside it.
    expect(errorOf(refused).details['suggestions']).toMatchObject({
      first: { kind: 'addons', items: [{ key: 'extra_products', quantity: 1 }], monthly: 149 },
      alternative: { kind: 'plan', name: 'Big' },
    });

    const before = await balanceOf(shop);
    // Two: 149 x 2 x 20/30 = 198.67.
    const quote = await shop.post('/addons/quote', {
      addonId: await addonId('extra_products'),
      quantity: 2,
    });
    expect(quote.status, JSON.stringify(quote.body)).toBe(201);
    const quoted = quote.body as { payment: { id: string; amount: string }; expiresAt: string };
    expect(quoted.payment.amount).toBe('199.00');
    expect(quoted.expiresAt).toBe(periodEnd?.toISOString());

    const paid = await shop.post('/addons/purchase', { paymentId: quoted.payment.id });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    const invoice = (paid.body as { invoice: Record<string, unknown> }).invoice;
    expect(invoice).toMatchObject({
      kind: 'addon',
      amount: '199.00',
      planName: null,
      planSnapshot: null,
      billingTermLabel: null,
      paymentMethod: 'balance',
      periodEnd: periodEnd?.toISOString(),
      lines: [
        {
          kind: 'addon',
          description: `Extra products, until ${dhakaDate(periodEnd ?? new Date())}`,
          quantity: 2,
          amount: '199.00',
        },
      ],
    });
    expect(Number(await balanceOf(shop))).toBe(Number(before) - 199);
    const ledger = await admin.query<{ type: string; amount: string }>(
      'SELECT type, amount FROM tenant.balance_ledger WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
      [shop.tenantId],
    );
    expect(ledger.rows[0]).toEqual({ type: 'addon', amount: '-199.00' });
    const activity = await admin.query<{ action: string }>(
      "SELECT action FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'addon_purchased'",
      [shop.tenantId],
    );
    expect(activity.rows).toHaveLength(1);

    const mine = (await shop.get('/addons/mine')).body as {
      addons: { key: string; quantity: number; expiresAt: string }[];
      brandIdentity: boolean;
    };
    expect(mine.addons).toEqual([
      expect.objectContaining({
        key: 'extra_products',
        quantity: 2,
        expiresAt: periodEnd?.toISOString(),
      }),
    ]);
    expect(mine.brandIdentity).toBe(false);

    // The product limit is 1 + 2 x 500 from the next request on.
    expect((await makeProduct(shop, 'Second')).status).toBe(201);
    const usage = (await shop.get('/usage')).body as {
      metrics: { metric: string; limit: number | null }[];
    };
    expect(usage.metrics.find((metric) => metric.metric === 'products')?.limit).toBe(1001);
    // UPG-03 (KNOWN-GAPS §84): an upgrade still credits the plan's own unused days, 449 x 20/30, never the add-on's.
    const upgrade = app.get(UpgradeService);
    const upgradeQuote = await upgrade.quote(shop.tenantId, bigPlanId, bigTermId);
    expect(upgradeQuote.creditAmount).toBe('299.00');

    // BIL-12: each invoice says what it is for, line by line, and the lines add up to what was paid -- here with the
    // extension of the products add-on, set to renew, to the new period's end (UPG-14).
    const upgraded = await upgrade.confirmFromBalance(upgradeQuote.id, shop.tenantId);
    const extension = upgraded.invoice?.lines[2];
    expect(upgraded.invoice).toMatchObject({
      amount: (400 + Number(extension?.amount)).toFixed(2),
      lines: [
        { kind: 'plan', description: 'Big, Big month', quantity: 1, amount: '699.00' },
        {
          kind: 'credit',
          description: 'Credit for the unused part of the current plan',
          quantity: 1,
          amount: '-299.00',
        },
        { kind: 'addon', quantity: 2 },
      ],
    });
    const listed = (await shop.get('/billing/invoices')).body as {
      kind: string;
      lines: { kind: string; description: string; amount: string }[];
    }[];
    expect(listed.find((each) => each.kind === 'purchase')?.lines).toEqual([
      { kind: 'plan', description: 'Small, Small month', quantity: 1, amount: '449.00' },
    ]);
  });

  it('raises the storage the media upload is held to', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    const upload = {
      kind: 'image',
      contentType: 'image/jpeg',
      bytes: 2_000_000,
      purpose: 'product_image',
    };
    // The plan holds 1 MB; one extra-storage add-on adds 1 GB.
    expect((await shop.post('/media/uploads', upload)).status).toBe(402);
    expect((await buy(shop, 'extra_storage')).status).toBe(201);
    expect((await shop.post('/media/uploads', upload)).status).toBe(201);
  });

  it('sells brand identity once, whichever of two quotes is paid first (BRN-05)', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    const id = await addonId('brand_identity');
    const two = await shop.post('/addons/quote', { addonId: id, quantity: 2 });
    expect(two.status).toBe(400);
    expect(errorOf(two).code).toBe('validation_error');

    const first = (await shop.post('/addons/quote', { addonId: id })).body as {
      payment: { id: string };
    };
    const second = (await shop.post('/addons/quote', { addonId: id })).body as {
      payment: { id: string };
    };
    expect((await shop.post('/addons/purchase', { paymentId: first.payment.id })).status).toBe(201);
    const mine = (await shop.get('/addons/mine')).body as { brandIdentity: boolean };
    expect(mine.brandIdentity).toBe(true);

    const before = await balanceOf(shop);
    const twice = await shop.post('/addons/purchase', { paymentId: second.payment.id });
    expect(twice.status).toBe(409);
    expect(errorOf(twice).code).toBe('conflict');
    expect(await balanceOf(shop)).toBe(before);
    expect(
      (await offersOf(shop)).find((offer) => offer.addon.key === 'brand_identity')?.price,
    ).toBe(null);
    expect((await shop.post('/addons/quote', { addonId: id })).status).toBe(409);
  });

  it('lets a plan that includes brand identity switch it on, and sells it no add-on for it', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await admin.query(
      `UPDATE control.tenants SET feature_snapshot = '{"brand_identity": true}' WHERE id = $1`,
      [shop.tenantId],
    );
    const mine = (await shop.get('/addons/mine')).body as {
      addons: unknown[];
      brandIdentity: boolean;
    };
    expect(mine).toMatchObject({ addons: [], brandIdentity: true });
    expect(
      (await offersOf(shop)).find((offer) => offer.addon.key === 'brand_identity')?.price,
    ).toBe(null);
    const quote = await shop.post('/addons/quote', { addonId: await addonId('brand_identity') });
    expect(quote.status).toBe(409);
  });

  it('never sells an add-on for a limit that is already unlimited (PLN-19)', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await admin.query(
      `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES ($1, 'products', 'null', 'add-on test', gen_random_uuid())`,
      [shop.tenantId],
    );
    const offer = (await offersOf(shop)).find((each) => each.addon.key === 'extra_products');
    expect(offer?.price).toBeNull();
    const quote = await shop.post('/addons/quote', { addonId: await addonId('extra_products') });
    expect(quote.status).toBe(409);
    expect(errorOf(quote).code).toBe('conflict');
  });

  it('refuses a quote past its hold, a short balance, another shop, and a wallet payment', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    const quoteOf = async (): Promise<string> =>
      (
        (await shop.post('/addons/quote', { addonId: await addonId('extra_seat') })).body as {
          payment: { id: string };
        }
      ).payment.id;

    // BIL-09: held for 30 minutes.
    const stale = await quoteOf();
    await admin.query(
      "UPDATE control.plan_payments SET quoted_at = now() - interval '31 minutes' WHERE id = $1",
      [stale],
    );
    const expired = await shop.post('/addons/purchase', { paymentId: stale });
    expect(expired.status).toBe(409);

    // Another shop's payment is not found.
    const other = await onPaidPlan(smallPlanId, smallTermId);
    const ours = await quoteOf();
    expect((await other.post('/addons/purchase', { paymentId: ours })).status).toBe(404);

    // An add-on is paid here, from the balance, until Slice 10a.2: the plan and upgrade routes don't know it.
    const wallet = {
      paymentId: ours,
      method: 'wallet',
      transactionId: `TX${randomUUID().slice(0, 8)}`,
      senderNumber: '01711111111',
      amountPaid: 33,
    };
    expect((await shop.post('/billing/purchase', wallet)).status).toBe(404);
    expect((await shop.post('/billing/upgrade/confirm', wallet)).status).toBe(404);
    expect(
      (await shop.post('/billing/purchase', { paymentId: ours, method: 'balance' })).status,
    ).toBe(404);

    // Too little in the balance: nothing is bought, nothing invoiced.
    const poor = await onPaidPlan(smallPlanId, smallTermId, '449.00');
    const short = await poor.post('/addons/quote', { addonId: await addonId('extra_seat') });
    const refused = await poor.post('/addons/purchase', {
      paymentId: (short.body as { payment: { id: string } }).payment.id,
    });
    expect(refused.status).toBe(429);
    expect(errorOf(refused).code).toBe('quota_exceeded');
    expect(((await poor.get('/addons/mine')).body as { addons: unknown[] }).addons).toEqual([]);
    const invoices = await admin.query(
      "SELECT 1 FROM control.invoices WHERE tenant_id = $1 AND kind = 'addon'",
      [poor.tenantId],
    );
    expect(invoices.rows).toHaveLength(0);
  });

  it('stops counting an add-on at its own end, whatever any job has done', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    expect((await buy(shop, 'extra_products')).status).toBe(201);
    await admin.query(
      "UPDATE control.addon_purchases SET expires_at = now() - interval '1 second' WHERE tenant_id = $1",
      [shop.tenantId],
    );
    expect(((await shop.get('/addons/mine')).body as { addons: unknown[] }).addons).toEqual([]);
    const usage = (await shop.get('/usage')).body as {
      metrics: { metric: string; limit: number | null }[];
    };
    expect(usage.metrics.find((metric) => metric.metric === 'products')?.limit).toBe(1);
  });
});

describeIfDatabase(
  "a downgrade judged by the shop's own limits (DWN-08, DWN-12, KNOWN-GAPS §85)",
  () => {
    async function downgradeNow(shop: ShopClient): Promise<void> {
      const service = app.get(DowngradeService);
      await service.schedule(shop.tenantId, smallPlanId);
      const change = await service.getScheduled(shop.tenantId);
      if (!change) throw new Error('no downgrade scheduled');
      await service.apply(change, new Date());
    }

    it('cuts seats to the shop’s own limit, its override with it, not the bare plan’s', async () => {
      const shop = await onPaidPlan(bigPlanId, bigTermId);
      const role = (await shop.post('/roles', { name: 'Packers', permissions: ['orders:read'] }))
        .body as { id: string };
      for (let index = 0; index < 3; index += 1) {
        const made = await shop.post('/staff', {
          phone: texts.freshPhone(),
          password: STAFF_PASSWORD,
          roleIds: [role.id],
        });
        expect(made.status, JSON.stringify(made.body)).toBe(201);
      }
      // PLN-11: support gave this shop four seats, on any plan.
      await admin.query(
        `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES ($1, 'staff', '4', 'add-on test', gen_random_uuid())`,
        [shop.tenantId],
      );

      await downgradeNow(shop);

      // The small plan has 2 seats, but the shop holds 4: the owner and all three stay.
      const seats = ((await shop.get('/staff')).body as { seats: { used: number; total: number } })
        .seats;
      expect(seats).toEqual({ used: 4, total: 4 });
    });

    it('ticks a checklist item off once an add-on brings the shop within the limit', async () => {
      const shop = await onPaidPlan(bigPlanId, bigTermId);
      for (const name of ['One', 'Two', 'Three']) {
        expect((await makeProduct(shop, name)).status).toBe(201);
      }
      await downgradeNow(shop);
      const before = (await shop.get('/billing/downgrade/checklist')).body as {
        checklist: { items: { key: string; used: number; limit: number; fixed: boolean }[] };
      };
      expect(before.checklist.items).toEqual([
        { key: 'products', used: 3, limit: 1, fixed: false },
      ]);

      expect((await buy(shop, 'extra_products')).status).toBe(201);
      const after = (await shop.get('/billing/downgrade/checklist')).body as {
        checklist: { items: { key: string; used: number; limit: number; fixed: boolean }[] };
      };
      expect(after.checklist.items).toEqual([
        { key: 'products', used: 3, limit: 501, fixed: true },
      ]);
    });
  },
);

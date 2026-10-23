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
import { DAY_MS } from '../src/common/time';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { AddonLifecycleService } from '../src/modules/billing/services/addon-lifecycle.service';
import { DowngradeService } from '../src/modules/billing/services/downgrade.service';
import { LifecycleService } from '../src/modules/billing/services/lifecycle.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { PlanPaymentsService } from '../src/modules/payments/services/plan-payments.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, postJson } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 10a.2, second part: add-ons counting through grace and lapsing after it (LIF-05, PLN-14); the stale-quote
// sweep and a late approval (BIL-15); the 7- and 1-day warnings (PLN-14); pay-as-you-go's and no-expiry plans' own 30
// days, renewed from the balance, carried over at a switch and joined to a plan bought later (PLN-14, PLN-18, PYG-10);
// the downgrade's over-limit record (DWN-12); and each period's own renewal reminders (BIL-14, KNOWN-GAPS §86). Runs only
// when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_addon_lifecycle_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const PASSWORD = 'correct-horse-9';
const BCRYPT_TIMEOUT_MS = 30_000;

interface PurchaseRow {
  id: string;
  key: string;
  quantity: number;
  status: string;
  renews: boolean;
  price: string;
  starts_at: Date | null;
  expires_at: Date;
  continues_id: string | null;
  plan_payment_id: string | null;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
const texts = new SmsCapture();
let smallPlanId = '';
let smallTermId = '';
let bigPlanId = '';
let bigTermId = '';

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'addon-lifecycle-e2e-otp-secret-0123456789';
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
    970,
    { products: 1, staff: 2, storage_mb: 1 },
    '449.00',
  ));
  ({ planId: bigPlanId, termId: bigTermId } = await plan(
    'Big',
    971,
    { products: 1000, staff: 5, storage_mb: 5000 },
    '699.00',
  ));
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));

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
  operator = {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
}, BCRYPT_TIMEOUT_MS * 2);

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** A shop that bought this plan from its balance, its period then moved to 10 of 30 days gone, invoices with it. */
async function onPaidPlan(
  planId: string,
  termId: string,
  balance = '5000.00',
): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'cycle');
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

/** A shop on pay-as-you-go: the seeded plan, no period, a balance to buy from. */
async function onPayAsYouGo(balance = '5000.00'): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'payg');
  await app.get(BalanceService).creditStandalone({
    tenantId: shop.tenantId,
    amount: balance,
    type: LedgerEntryType.TopUp,
  });
  await admin.query(
    `UPDATE control.tenants SET state = 'pay_as_you_go',
       plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
       plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go'),
       feature_snapshot = (SELECT features FROM control.plans WHERE name = 'Pay-as-you-go'),
       period_start = now(), period_end = NULL
     WHERE id = $1`,
    [shop.tenantId],
  );
  return shop;
}

async function addonId(key: string): Promise<string> {
  const row = await admin.query<{ id: string }>('SELECT id FROM control.addons WHERE key = $1', [
    key,
  ]);
  return row.rows[0]?.id ?? '';
}

async function quote(shop: ShopClient, key: string): Promise<string> {
  const quoted = await shop.post('/addons/quote', { addonId: await addonId(key) });
  expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
  return (quoted.body as { payment: { id: string } }).payment.id;
}

async function buy(shop: ShopClient, key: string): Promise<void> {
  const paid = await shop.post('/addons/purchase', { paymentId: await quote(shop, key) });
  expect(paid.status, JSON.stringify(paid.body)).toBe(201);
}

async function purchasesOf(shop: ShopClient): Promise<PurchaseRow[]> {
  return (
    await admin.query<PurchaseRow>(
      `SELECT p.id, a.key, p.quantity, p.status, p.renews, p.price, p.starts_at, p.expires_at, p.continues_id,
              p.plan_payment_id
       FROM control.addon_purchases p JOIN control.addons a ON a.id = p.addon_id
       WHERE p.tenant_id = $1 ORDER BY p.purchased_at, p.continues_id IS NOT NULL, p.id`,
      [shop.tenantId],
    )
  ).rows;
}

async function idOf(shop: ShopClient, key: string): Promise<string> {
  return (await purchasesOf(shop)).find((row) => row.key === key)?.id ?? '';
}

/** Ends the shop's period `offset` from now (an SQL interval), with the add-ons bought into it. */
async function endPeriod(shop: ShopClient, offset: string, state = 'active'): Promise<void> {
  await admin.query(
    `UPDATE control.tenants SET state = $2, period_end = date_trunc('milliseconds', now() + $3::interval) WHERE id = $1`,
    [shop.tenantId, state, offset],
  );
  await admin.query(
    `UPDATE control.addon_purchases SET expires_at = (SELECT period_end FROM control.tenants WHERE id = $1)
     WHERE tenant_id = $1 AND status = 'active'`,
    [shop.tenantId],
  );
}

async function productLimit(shop: ShopClient): Promise<number | null> {
  const usage = (await shop.get('/usage')).body as {
    metrics: { metric: string; limit: number | null }[];
  };
  return usage.metrics.find((metric) => metric.metric === 'products')?.limit ?? null;
}

async function actions(
  shop: ShopClient,
  action: string,
): Promise<{ target_id: string; summary: unknown }[]> {
  return (
    await admin.query<{ target_id: string; summary: unknown }>(
      'SELECT target_id, summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2 ORDER BY id',
      [shop.tenantId, action],
    )
  ).rows;
}

function tick(): Promise<unknown> {
  return app.get(AddonLifecycleService).runTick(new Date());
}

function payByWallet(shop: ShopClient, path: string, paymentId: string, amount: number) {
  return shop.post(path, {
    paymentId,
    method: 'wallet',
    transactionId: `TX${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    senderNumber: '01711111111',
    amountPaid: amount,
  });
}

async function giveOwnerEmail(shop: ShopClient): Promise<string> {
  const email = `owner.${randomUUID().slice(0, 8)}@example.com`;
  await admin.query('UPDATE tenant.users SET email = $2 WHERE tenant_id = $1 AND is_owner', [
    shop.tenantId,
    email,
  ]);
  return email;
}

async function mailTo(email: string): Promise<{ subject: string; body: string }[]> {
  return (
    await admin.query<{ subject: string; body: string }>(
      'SELECT subject, body FROM control.mail_outbox WHERE to_email = $1 ORDER BY created_at',
      [email],
    )
  ).rows;
}

describeIfDatabase('add-ons through grace, and their lapse (LIF-05, PLN-14)', () => {
  it('keeps an add-on counting through grace, and lapses it once grace is over', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products');
    // The period ended two days ago and the shop is in grace: everything works as before.
    await endPeriod(shop, '-2 days', 'grace');
    expect(await productLimit(shop)).toBe(501);
    await tick();
    expect((await purchasesOf(shop))[0]?.status).toBe('active');

    // Grace is over: the add-on no longer counts, and the tick records its end.
    await admin.query("UPDATE control.tenants SET state = 'read_only' WHERE id = $1", [
      shop.tenantId,
    ]);
    expect(await productLimit(shop)).toBe(1);
    await tick();
    const [row] = await purchasesOf(shop);
    expect(row?.status).toBe('lapsed');
    expect((await actions(shop, 'addon_lapsed')).map((entry) => entry.target_id)).toEqual([
      row?.id,
    ]);
    await tick();
    expect(await actions(shop, 'addon_lapsed')).toHaveLength(1);
  });

  it('never lapses an add-on its renewal continues, and lapses the one left out', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products');
    await buy(shop, 'extra_seat');
    await shop.patch(`/addons/mine/${await idOf(shop, 'extra_seat')}`, { renews: false });
    const renewal = (
      await shop.post('/billing/quote', { planId: smallPlanId, billingTermId: smallTermId })
    ).body as { id: string };
    expect(
      (await shop.post('/billing/purchase', { paymentId: renewal.id, method: 'balance' })).status,
    ).toBe(201);
    // Time passes: the renewed period has begun.
    const before = await purchasesOf(shop);
    const oldEnd = before.find((row) => row.key === 'extra_seat')?.expires_at;
    await admin.query(
      `UPDATE control.addon_purchases SET expires_at = now() - interval '1 minute'
       WHERE tenant_id = $1 AND expires_at = $2`,
      [shop.tenantId, oldEnd],
    );
    await admin.query(
      `UPDATE control.addon_purchases SET starts_at = now() - interval '1 minute'
       WHERE tenant_id = $1 AND continues_id IS NOT NULL`,
      [shop.tenantId],
    );
    await tick();
    const after = await purchasesOf(shop);
    const statuses = after.map((row) => [
      row.key,
      row.continues_id === null ? 'bought' : 'renewed',
      row.status,
    ]);
    expect(statuses).toEqual([
      ['extra_products', 'bought', 'active'],
      ['extra_products', 'renewed', 'active'],
      ['extra_seat', 'bought', 'lapsed'],
    ]);
  });
});

describeIfDatabase('quotes no one is waiting on (BIL-15)', () => {
  it("cancels an expired quote's add-ons, and takes no transaction ID for it afterwards", async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products');
    const renewal = (
      await shop.post('/billing/quote', { planId: smallPlanId, billingTermId: smallTermId })
    ).body as { id: string; amount: string };
    await admin.query(
      "UPDATE control.plan_payments SET quoted_at = now() - interval '25 hours' WHERE id = $1",
      [renewal.id],
    );
    await app.get(PlanPaymentsService).expireStalePending(new Date());
    await tick();
    const carried = () =>
      purchasesOf(shop).then((rows) => rows.filter((row) => row.plan_payment_id === renewal.id));
    expect((await carried()).map((row) => row.status)).toEqual(['cancelled']);

    // BIL-15 (amended 2026-10-23): a transaction ID goes only on an open request -- the seller starts again, or adds
    // money already sent with Top up. The add-on stays cancelled.
    const late = await payByWallet(shop, '/billing/purchase', renewal.id, Number(renewal.amount));
    expect(late.status).toBe(409);
    expect((late.body as { error: { code: string } }).error.code).toBe('conflict');
    expect((await carried()).map((row) => row.status)).toEqual(['cancelled']);
  });

  it("cancels a turned-down payment's add-on at once", async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    const paymentId = await quote(shop, 'extra_products');
    await payByWallet(shop, '/addons/purchase', paymentId, 99);
    const rejected = await postJson(
      port,
      `/operator/payment-queue/${paymentId}/reject`,
      { note: 'No such transaction' },
      operator,
    );
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(201);
    expect((await purchasesOf(shop))[0]?.status).toBe('cancelled');
  });
});

describeIfDatabase('warning of an add-on that will not renew (PLN-14)', () => {
  it('emails 7 and 1 days ahead, once each, only for an add-on that will not renew', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    const email = await giveOwnerEmail(shop);
    await buy(shop, 'extra_products');
    await buy(shop, 'extra_seat');
    await shop.patch(`/addons/mine/${await idOf(shop, 'extra_seat')}`, { renews: false });

    await endPeriod(shop, '6 days');
    const mine = (await shop.get('/addons/mine')).body as {
      addons: { key: string; renewal: string; endsSoon: boolean }[];
    };
    expect(mine.addons.map((addon) => [addon.key, addon.renewal, addon.endsSoon])).toEqual([
      ['extra_products', 'with_plan', false],
      ['extra_seat', 'off', true],
    ]);
    await tick();
    await tick();
    let mail = await mailTo(email);
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ subject: 'An add-on ends soon' });
    expect(mail[0]?.body).toContain('Extra seat ends on');
    expect(mail[0]?.body).toContain('its renewal is switched off');

    await endPeriod(shop, '20 hours');
    await tick();
    await tick();
    mail = await mailTo(email);
    expect(mail).toHaveLength(2);
    expect(
      (await actions(shop, 'addon_ending_warned')).map(
        (entry) => (entry.summary as { day: number }).day,
      ),
    ).toEqual([7, 1]);
  });

  it('warns when auto-renew would not reach an add-on, by how short the balance is', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await giveOwnerEmail(shop);
    await buy(shop, 'extra_products');
    const balance = app.get(BalanceService);
    const { amount } = await balance.current(shop.tenantId);
    // Enough for the plan's 449, not for the add-on's 149 on top.
    await balance.chargeStandalone({
      tenantId: shop.tenantId,
      type: LedgerEntryType.Adjustment,
      amount: (Number(amount) - 500).toFixed(2),
    });
    await admin.query('UPDATE control.tenants SET auto_renew_enabled = true WHERE id = $1', [
      shop.tenantId,
    ]);
    await endPeriod(shop, '3 days');
    const mine = (await shop.get('/addons/mine')).body as {
      addons: { renewal: string; endsSoon: boolean }[];
    };
    expect(mine.addons).toEqual([
      expect.objectContaining({ renewal: 'balance_short', endsSoon: true }),
    ]);
    await tick();
    expect(await actions(shop, 'addon_ending_warned')).toHaveLength(1);
  });
});

describeIfDatabase('add-ons on their own 30 days (PLN-14, PLN-18, PYG-10)', () => {
  it('sells pay-as-you-go a month at the full price, and renews it from the balance at its end', async () => {
    const shop = await onPayAsYouGo();
    const offer = (
      (await shop.get('/addons')).body as { addon: { key: string }; price: number | null }[]
    ).find((each) => each.addon.key === 'extra_products');
    expect(offer?.price).toBe(149);
    await buy(shop, 'extra_products');
    const [bought] = await purchasesOf(shop);
    const days = ((bought?.expires_at.getTime() ?? 0) - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    const mine = (await shop.get('/addons/mine')).body as { addons: { renewal: string }[] };
    expect(mine.addons[0]?.renewal).toBe('from_balance');

    // Its 30 days are up: the tick renews it from the balance, continuing it.
    await admin.query(
      "UPDATE control.addon_purchases SET expires_at = now() - interval '1 minute' WHERE tenant_id = $1",
      [shop.tenantId],
    );
    await tick();
    const [old, next] = await purchasesOf(shop);
    expect(next).toMatchObject({
      key: 'extra_products',
      status: 'active',
      price: '149.00',
      continues_id: old?.id,
    });
    expect(((next?.expires_at.getTime() ?? 0) - (next?.starts_at?.getTime() ?? 0)) / DAY_MS).toBe(
      30,
    );
    const ledger = await admin.query<{ type: string; amount: string }>(
      'SELECT type, amount FROM tenant.balance_ledger WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
      [shop.tenantId],
    );
    expect(ledger.rows[0]).toEqual({ type: 'addon', amount: '-149.00' });
    expect(old?.status).toBe('active');
    await tick();
    expect((await purchasesOf(shop)).map((row) => row.status)).toEqual(['active', 'active']);
  });

  it('lets an add-on lapse when the balance is short of its next 30 days, and says so', async () => {
    const shop = await onPayAsYouGo('200.00');
    await buy(shop, 'extra_products');
    // 51 left, short of 149 by 98.
    await admin.query(
      "UPDATE control.addon_purchases SET expires_at = now() - interval '1 minute' WHERE tenant_id = $1",
      [shop.tenantId],
    );
    await tick();
    expect((await purchasesOf(shop)).map((row) => row.status)).toEqual(['lapsed']);
    expect((await actions(shop, 'addon_not_renewed')).map((entry) => entry.summary)).toEqual([
      { addons: [{ key: 'extra_products', quantity: 1, price: '149.00' }], short: '98.00' },
    ]);
  });

  it('sells a shop on a no-expiry plan its own 30 days too', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await admin.query('UPDATE control.tenants SET period_end = NULL WHERE id = $1', [
      shop.tenantId,
    ]);
    const offer = (
      (await shop.get('/addons')).body as { addon: { key: string }; price: number | null }[]
    ).find((each) => each.addon.key === 'extra_products');
    expect(offer?.price).toBe(149);
    await buy(shop, 'extra_products');
    const days = (((await purchasesOf(shop))[0]?.expires_at.getTime() ?? 0) - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(29.9);
  });

  it("carries a plan's renewing add-ons into their own 30 days when the shop moves to pay-as-you-go", async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products');
    await buy(shop, 'extra_seat');
    await shop.patch(`/addons/mine/${await idOf(shop, 'extra_seat')}`, { renews: false });
    expect((await shop.post('/billing/pay-as-you-go', {})).status).toBe(201);
    // The period ends: the switch takes effect, then the add-ons' tick.
    await endPeriod(shop, '-1 minute');
    await admin.query(
      "UPDATE control.scheduled_plan_changes SET effective_at = now() - interval '1 minute' WHERE tenant_id = $1",
      [shop.tenantId],
    );
    await app.get(DowngradeService).applyDueChanges(new Date());
    await tick();
    const rows = await purchasesOf(shop);
    expect(
      rows.map((row) => [row.key, row.continues_id === null ? 'bought' : 'renewed', row.status]),
    ).toEqual([
      ['extra_products', 'bought', 'active'],
      ['extra_products', 'renewed', 'active'],
      ['extra_seat', 'bought', 'lapsed'],
    ]);
    const renewed = rows[1];
    expect(renewed?.price).toBe('149.00');
    expect(((renewed?.expires_at.getTime() ?? 0) - Date.now()) / DAY_MS).toBeGreaterThan(29.9);
  });

  it("joins a pay-as-you-go add-on to a plan bought later, prorated to the plan's period end", async () => {
    const shop = await onPayAsYouGo();
    await buy(shop, 'extra_products');
    const purchase = app.get(PurchaseService);
    const planQuote = await purchase.quote(shop.tenantId, smallPlanId, smallTermId);
    await purchase.confirmFromBalance(planQuote.id, shop.tenantId);
    await admin.query(
      `UPDATE control.tenants SET period_start = date_trunc('second', now()) - interval '10 days',
         period_end = date_trunc('second', now()) + interval '20 days' WHERE id = $1`,
      [shop.tenantId],
    );
    await admin.query(
      "UPDATE control.addon_purchases SET expires_at = now() - interval '1 minute' WHERE tenant_id = $1",
      [shop.tenantId],
    );
    await tick();
    const [, joined] = await purchasesOf(shop);
    // 149 x 20/30 = 99.33.
    expect(joined?.price).toBe('99.00');
    const periodEnd = (
      await admin.query<{ period_end: Date }>(
        'SELECT period_end FROM control.tenants WHERE id = $1',
        [shop.tenantId],
      )
    ).rows[0]?.period_end;
    expect(joined?.expires_at.getTime()).toBe(periodEnd?.getTime());
    const mine = (await shop.get('/addons/mine')).body as { addons: { renewal: string }[] };
    expect(mine.addons.map((addon) => addon.renewal)).toEqual(['with_plan']);
  });
});

describeIfDatabase("a downgrade's record of what it left over (DWN-12, PLN-14)", () => {
  it('counts only the add-ons that will renew onto the smaller plan', async () => {
    const shop = await onPaidPlan(bigPlanId, bigTermId);
    for (const name of ['One', 'Two', 'Three']) {
      const made = await shop.post('/products', {
        name,
        basePrice: 100,
        variants: [{ optionIds: [] }],
      });
      expect(made.status).toBe(201);
    }
    await buy(shop, 'extra_products');
    await shop.patch(`/addons/mine/${await idOf(shop, 'extra_products')}`, { renews: false });
    const service = app.get(DowngradeService);
    await service.schedule(shop.tenantId, smallPlanId);
    const change = await service.getScheduled(shop.tenantId);
    if (!change) throw new Error('no downgrade scheduled');
    await service.apply(change, new Date());
    // The add-on still counts until the period ends, but it will not renew: the products are recorded as over.
    const checklist = (await shop.get('/billing/downgrade/checklist')).body as {
      checklist: { items: { key: string }[] } | null;
    };
    expect(checklist.checklist?.items.map((item) => item.key)).toEqual(['products']);
  });
});

describeIfDatabase("each period's own renewal reminders (BIL-14, KNOWN-GAPS §86)", () => {
  it('sends a period its 7-day reminder whatever was sent for the periods before', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await endPeriod(shop, '6 days');
    // The last period's reminders: one naming its period end, one from before reminders named one.
    for (const summary of [{ day: 7, periodEnd: '2026-09-22T00:00:00.000Z' }, { day: 7 }]) {
      await admin.query(
        `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
         VALUES ($1, 'system', NULL, 'renewal_reminder_sent', 'success', $2, now() - interval '30 days')`,
        [shop.tenantId, JSON.stringify(summary)],
      );
    }
    await app.get(LifecycleService).runTick(new Date());
    const reminders = await actions(shop, 'renewal_reminder_sent');
    expect(reminders).toHaveLength(3);
    expect(reminders[2]?.summary).toMatchObject({ day: 7 });
  });

  it('does not send one twice for a reminder written just before they named their period', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await endPeriod(shop, '6 days');
    await admin.query(
      `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
       VALUES ($1, 'system', NULL, 'renewal_reminder_sent', 'success', '{"day": 7}', now() - interval '1 hour')`,
      [shop.tenantId],
    );
    await app.get(LifecycleService).runTick(new Date());
    expect(await actions(shop, 'renewal_reminder_sent')).toHaveLength(1);
  });
});

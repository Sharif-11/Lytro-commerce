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
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { LifecycleService } from '../src/modules/billing/services/lifecycle.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { UpgradeService } from '../src/modules/billing/services/upgrade.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, postJson, type HttpResult } from './support/http';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 10a.2, first part: paying an add-on by wallet through the operator's queue, and what an approval does
// when the shop changed since the quote (PLN-14, BIL-02, D2-1); add-ons renewed in the plan's renewal payment at the
// catalogue's price, and by auto-renew as far as the balance reaches (PLN-14, BIL-10, BIL-17); extended by an upgrade
// (UPG-14); and the renewal switch (PLN-14). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_addon_renewal_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const PASSWORD = 'correct-horse-9';
const BCRYPT_TIMEOUT_MS = 30_000;

interface PurchaseRow {
  key: string;
  quantity: number;
  status: string;
  renews: boolean;
  price: string;
  paid_from: string;
  starts_at: Date | null;
  expires_at: Date;
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
  process.env['OTP_SECRET'] = 'addon-renewal-e2e-otp-secret-0123456789ab';
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
    960,
    { products: 1, staff: 2, storage_mb: 1, paired_devices: 1 },
    '449.00',
  ));
  ({ planId: bigPlanId, termId: bigTermId } = await plan(
    'Big',
    961,
    { products: 1000, staff: 5, storage_mb: 5000, paired_devices: 3 },
    '699.00',
  ));
  // Two items of this suite's own, so retiring one and repricing the other never touches the seeded catalogue.
  for (const key of ['retiring_device', 'repriced_device']) {
    await admin.query(
      `INSERT INTO control.addons (key, kind, limit_key, unit_size, price, label_en, label_bn)
       VALUES ($1, 'limit', 'paired_devices', 1, 39, $2, 'এক্সট্রা ডিভাইস')`,
      [key, key === 'retiring_device' ? 'Retiring device' : 'Repriced device'],
    );
  }
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
  const shop = await openShop(port, texts, 'renew');
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

async function addonId(key: string): Promise<string> {
  const row = await admin.query<{ id: string }>('SELECT id FROM control.addons WHERE key = $1', [
    key,
  ]);
  return row.rows[0]?.id ?? '';
}

async function quote(shop: ShopClient, key: string, quantity = 1): Promise<string> {
  const quoted = await shop.post('/addons/quote', { addonId: await addonId(key), quantity });
  expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
  return (quoted.body as { payment: { id: string } }).payment.id;
}

async function buy(shop: ShopClient, key: string, quantity = 1): Promise<void> {
  const paid = await shop.post('/addons/purchase', {
    paymentId: await quote(shop, key, quantity),
  });
  expect(paid.status, JSON.stringify(paid.body)).toBe(201);
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

function approve(paymentId: string): Promise<HttpResult> {
  return postJson(port, `/operator/payment-queue/${paymentId}/approve`, {}, operator);
}

async function purchasesOf(shop: ShopClient): Promise<PurchaseRow[]> {
  return (
    await admin.query<PurchaseRow>(
      `SELECT a.key, p.quantity, p.status, p.renews, p.price, p.paid_from, p.starts_at, p.expires_at,
              p.plan_payment_id
       FROM control.addon_purchases p JOIN control.addons a ON a.id = p.addon_id
       WHERE p.tenant_id = $1 ORDER BY p.purchased_at, p.id`,
      [shop.tenantId],
    )
  ).rows;
}

async function periodOf(shop: ShopClient): Promise<{ start: Date; end: Date }> {
  const row = (
    await admin.query<{ period_start: Date; period_end: Date }>(
      'SELECT period_start, period_end FROM control.tenants WHERE id = $1',
      [shop.tenantId],
    )
  ).rows[0];
  if (!row) throw new Error('no tenant');
  return { start: row.period_start, end: row.period_end };
}

async function ledgerOf(
  shop: ShopClient,
  count: number,
): Promise<{ type: string; amount: string }[]> {
  return (
    await admin.query<{ type: string; amount: string }>(
      'SELECT type, amount FROM tenant.balance_ledger WHERE tenant_id = $1 ORDER BY id DESC LIMIT $2',
      [shop.tenantId, count],
    )
  ).rows.reverse();
}

async function mine(
  shop: ShopClient,
): Promise<{ key: string; renewal: string; quantity: number }[]> {
  const answer = await shop.get('/addons/mine');
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return (answer.body as { addons: { key: string; renewal: string; quantity: number }[] }).addons;
}

describeIfDatabase('paying an add-on by wallet (PLN-14, BIL-02, D2-1)', () => {
  it('waits in the operator queue, named, and starts when approved', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    const paymentId = await quote(shop, 'extra_products', 2);
    const submitted = await payByWallet(shop, '/addons/purchase', paymentId, 199);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    expect(submitted.body).toMatchObject({
      payment: { id: paymentId, status: 'pending' },
      invoice: null,
    });
    expect(await mine(shop)).toEqual([]);

    // ADM-06: the queue says what the money is for.
    const queue = await getJson(port, '/operator/payment-queue', operator);
    expect(queue.status).toBe(200);
    const queued = (queue.body as { id: string; addons: unknown[] }[]).find(
      (payment) => payment.id === paymentId,
    );
    expect(queued?.addons).toEqual([
      expect.objectContaining({
        key: 'extra_products',
        quantity: 2,
        price: '199.00',
        status: 'pending',
      }),
    ]);

    const balanceBefore = (await ledgerOf(shop, 1))[0];
    expect((await approve(paymentId)).status).toBe(201);
    expect(await mine(shop)).toEqual([
      expect.objectContaining({ key: 'extra_products', quantity: 2 }),
    ]);
    expect((await purchasesOf(shop))[0]).toMatchObject({ status: 'active', paid_from: 'wallet' });
    // Paid by wallet, so the balance is not charged; the invoice names the transaction.
    expect((await ledgerOf(shop, 1))[0]).toEqual(balanceBefore);
    const invoice = await admin.query<{ payment_method: string; payment_reference: string | null }>(
      "SELECT payment_method, payment_reference FROM control.invoices WHERE tenant_id = $1 AND kind = 'addon'",
      [shop.tenantId],
    );
    expect(invoice.rows[0]?.payment_method).toBe('wallet');
    expect(invoice.rows[0]?.payment_reference).toMatch(/^TX/);
  });

  it('runs into the period running at approval, never shorter and never re-priced', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    const paymentId = await quote(shop, 'extra_products');
    await payByWallet(shop, '/addons/purchase', paymentId, 99);
    // The shop renewed meanwhile: its period now ends a month later.
    await admin.query(
      "UPDATE control.tenants SET period_end = period_end + interval '1 month' WHERE id = $1",
      [shop.tenantId],
    );
    expect((await approve(paymentId)).status).toBe(201);
    const [row] = await purchasesOf(shop);
    expect(row?.expires_at.getTime()).toBe((await periodOf(shop)).end.getTime());
    expect(row?.price).toBe('99.00');
  });

  it('credits the balance instead when the shop can no longer take it, and says why', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    const paymentId = await quote(shop, 'extra_products');
    await payByWallet(shop, '/addons/purchase', paymentId, 99);
    // Support made products unlimited meanwhile: there is nothing left for the add-on to raise.
    await admin.query(
      `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES ($1, 'products', 'null', 'renewal test', gen_random_uuid())`,
      [shop.tenantId],
    );
    expect((await approve(paymentId)).status).toBe(201);

    expect((await purchasesOf(shop))[0]?.status).toBe('cancelled');
    expect(await mine(shop)).toEqual([]);
    expect((await ledgerOf(shop, 1))[0]).toEqual({ type: 'top_up', amount: '99.00' });
    const invoices = await admin.query(
      "SELECT 1 FROM control.invoices WHERE tenant_id = $1 AND kind = 'addon'",
      [shop.tenantId],
    );
    expect(invoices.rows).toHaveLength(0);
    const told = await admin.query<{ body: string }>(
      'SELECT body FROM control.sms_outbox WHERE body LIKE $1',
      ['%Extra products could not add it, because your plan no longer limits what it adds%'],
    );
    expect(told.rows).toHaveLength(1);
  });
});

describeIfDatabase('renewing add-ons with the plan (PLN-14, BIL-10, BIL-17)', () => {
  it("carries every add-on set to renew in the renewal's one payment, at the catalogue's price now", async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products', 2);
    await buy(shop, 'extra_seat');
    await buy(shop, 'retiring_device');
    await buy(shop, 'repriced_device');
    const seatId = (
      await admin.query<{ id: string }>(
        `SELECT p.id FROM control.addon_purchases p JOIN control.addons a ON a.id = p.addon_id
         WHERE p.tenant_id = $1 AND a.key = 'extra_seat'`,
        [shop.tenantId],
      )
    ).rows[0]?.id;
    // The owner switches the seat's renewal off; the catalogue retires one item and reprices another.
    const switched = await shop.patch(`/addons/mine/${seatId ?? ''}`, { renews: false });
    expect(switched.status, JSON.stringify(switched.body)).toBe(200);
    await admin.query("UPDATE control.addons SET retired_at = now() WHERE key = 'retiring_device'");
    await admin.query("UPDATE control.addons SET price = 45 WHERE key = 'repriced_device'");
    expect(
      Object.fromEntries((await mine(shop)).map((addon) => [addon.key, addon.renewal])),
    ).toEqual({
      extra_products: 'with_plan',
      extra_seat: 'off',
      retiring_device: 'retired',
      repriced_device: 'with_plan',
    });

    const oldEnd = (await periodOf(shop)).end;
    // 449 for the plan, 149 x 2 for the products, 45 for the repriced device.
    const renewal = await shop.post('/billing/quote', {
      planId: smallPlanId,
      billingTermId: smallTermId,
    });
    expect(renewal.status, JSON.stringify(renewal.body)).toBe(201);
    const payment = renewal.body as { id: string; kind: string; amount: string };
    expect(payment).toMatchObject({ kind: 'renewal', amount: '792.00' });
    const paid = await shop.post('/billing/purchase', { paymentId: payment.id, method: 'balance' });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);

    // Two ledger entries, so the statement says what each part paid for.
    expect(await ledgerOf(shop, 2)).toEqual([
      { type: 'plan_payment', amount: '-449.00' },
      { type: 'addon', amount: '-343.00' },
    ]);
    const { end: newEnd } = await periodOf(shop);
    const renewed = (await purchasesOf(shop)).filter((row) => row.plan_payment_id === payment.id);
    expect(renewed.map((row) => [row.key, row.quantity, row.price, row.status])).toEqual([
      ['extra_products', 2, '298.00', 'active'],
      ['repriced_device', 1, '45.00', 'active'],
    ]);
    // Renewed early, they start where the period being renewed ends and run with the new one.
    for (const row of renewed) {
      expect(row.starts_at?.getTime()).toBe(oldEnd.getTime());
      expect(row.expires_at.getTime()).toBe(newEnd.getTime());
    }
    const invoices = (await shop.get('/billing/invoices')).body as {
      kind: string;
      amount: string;
      lines: { kind: string; description: string; quantity: number; amount: string }[];
    }[];
    const invoice = invoices.find((each) => each.kind === 'renewal');
    expect(invoice?.amount).toBe('792.00');
    expect(invoice?.lines.map((line) => [line.kind, line.quantity, line.amount])).toEqual([
      ['plan', 1, '449.00'],
      ['addon', 2, '298.00'],
      ['addon', 1, '45.00'],
    ]);
  });

  it('leaves out an add-on the plan no longer limits, and starts a wallet renewal’s add-ons when approved', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products');
    await buy(shop, 'extra_seat');
    await admin.query(
      `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES ($1, 'products', 'null', 'renewal test', gen_random_uuid())`,
      [shop.tenantId],
    );
    expect((await mine(shop)).find((addon) => addon.key === 'extra_products')?.renewal).toBe(
      'unlimited',
    );
    const renewal = (
      await shop.post('/billing/quote', { planId: smallPlanId, billingTermId: smallTermId })
    ).body as { id: string; amount: string };
    expect(renewal.amount).toBe('498.00');

    expect((await payByWallet(shop, '/billing/purchase', renewal.id, 498)).status).toBe(201);
    expect((await approve(renewal.id)).status).toBe(201);
    const renewed = (await purchasesOf(shop)).filter((row) => row.plan_payment_id === renewal.id);
    expect(renewed.map((row) => [row.key, row.status, row.paid_from])).toEqual([
      ['extra_seat', 'active', 'wallet'],
    ]);
  });

  it('brings back the ended period’s add-ons when the shop renews during grace', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products');
    // The period ended a day ago and the shop is in grace (LIF-05), its add-on ended with the period.
    await admin.query(
      "UPDATE control.tenants SET state = 'grace', period_end = now() - interval '1 day' WHERE id = $1",
      [shop.tenantId],
    );
    await admin.query(
      "UPDATE control.addon_purchases SET expires_at = (SELECT date_trunc('milliseconds', period_end) FROM control.tenants WHERE id = $1) WHERE tenant_id = $1",
      [shop.tenantId],
    );
    const renewal = (
      await shop.post('/billing/quote', { planId: smallPlanId, billingTermId: smallTermId })
    ).body as { id: string; kind: string; amount: string };
    expect(renewal).toMatchObject({ kind: 'renewal', amount: '598.00' });
    expect(
      (await shop.post('/billing/purchase', { paymentId: renewal.id, method: 'balance' })).status,
    ).toBe(201);
    // The new period starts now, and the add-on with it.
    const { start, end } = await periodOf(shop);
    const [renewed] = (await purchasesOf(shop)).filter((row) => row.plan_payment_id === renewal.id);
    expect(renewed?.starts_at?.getTime()).toBe(start.getTime());
    expect(renewed?.expires_at.getTime()).toBe(end.getTime());
    expect(await mine(shop)).toEqual([expect.objectContaining({ key: 'extra_products' })]);
  });

  it('auto-renews the plan, then add-ons oldest first as far as the balance reaches', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products');
    await buy(shop, 'extra_seat');
    // 449 + 149 fit; the seat's 49 does not, by 29.
    const balance = app.get(BalanceService);
    const { amount } = await balance.current(shop.tenantId);
    await balance.chargeStandalone({
      tenantId: shop.tenantId,
      type: LedgerEntryType.Adjustment,
      amount: (Number(amount) - 618).toFixed(2),
    });
    // The period has just ended, with the add-ons bought into it.
    await admin.query(
      "UPDATE control.tenants SET auto_renew_enabled = true, period_end = now() - interval '1 minute' WHERE id = $1",
      [shop.tenantId],
    );
    await admin.query(
      "UPDATE control.addon_purchases SET expires_at = (SELECT date_trunc('milliseconds', period_end) FROM control.tenants WHERE id = $1) WHERE tenant_id = $1",
      [shop.tenantId],
    );

    await app.get(LifecycleService).runTick(new Date());

    expect((await balance.current(shop.tenantId)).amount).toBe('20.00');
    expect(await ledgerOf(shop, 2)).toEqual([
      { type: 'plan_payment', amount: '-449.00' },
      { type: 'addon', amount: '-149.00' },
    ]);
    const { end } = await periodOf(shop);
    const current = (await purchasesOf(shop)).filter(
      (row) => row.expires_at.getTime() === end.getTime(),
    );
    expect(current.map((row) => row.key)).toEqual(['extra_products']);
    const told = await admin.query<{ summary: { addons: { key: string }[]; short: string } }>(
      "SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'addon_not_renewed'",
      [shop.tenantId],
    );
    expect(told.rows.map((row) => row.summary)).toEqual([
      { addons: [{ key: 'extra_seat', quantity: 1, price: '49.00' }], short: '29.00' },
    ]);
  });
});

describeIfDatabase('extending add-ons with an upgrade (UPG-14)', () => {
  it('prices each renewing add-on to the new period’s end in the upgrade, and leaves the others to end', async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products');
    await buy(shop, 'extra_seat');
    const seatId = (
      await admin.query<{ id: string }>(
        `SELECT p.id FROM control.addon_purchases p JOIN control.addons a ON a.id = p.addon_id
         WHERE p.tenant_id = $1 AND a.key = 'extra_seat'`,
        [shop.tenantId],
      )
    ).rows[0]?.id;
    await shop.patch(`/addons/mine/${seatId ?? ''}`, { renews: false });
    const oldEnd = (await periodOf(shop)).end;

    const upgrade = app.get(UpgradeService);
    const quoted = await upgrade.quote(shop.tenantId, bigPlanId, bigTermId);
    // The plan's own part is 699 less the 299 credit; the products add-on's extension is on top.
    const [extension] = (await purchasesOf(shop)).filter(
      (row) => row.plan_payment_id === quoted.id,
    );
    expect(extension).toMatchObject({ key: 'extra_products', status: 'pending' });
    expect(Number(extension?.price)).toBeGreaterThan(0);
    expect(Number(extension?.price)).toBeLessThan(149);
    expect(quoted.amount).toBe((400 + Number(extension?.price)).toFixed(2));

    const confirmed = await upgrade.confirmFromBalance(quoted.id, shop.tenantId);
    expect(await ledgerOf(shop, 2)).toEqual([
      { type: 'plan_payment', amount: '-400.00' },
      { type: 'addon', amount: `-${extension?.price ?? ''}` },
    ]);
    const { end: newEnd } = await periodOf(shop);
    const rows = await purchasesOf(shop);
    const extended = rows.find((row) => row.plan_payment_id === quoted.id);
    expect(extended?.status).toBe('active');
    expect(extended?.starts_at?.getTime()).toBe(oldEnd.getTime());
    expect(extended?.expires_at.getTime()).toBe(newEnd.getTime());
    // The seat, its renewal off, keeps its own end.
    expect(
      rows.filter((row) => row.key === 'extra_seat').map((row) => row.expires_at.getTime()),
    ).toEqual([oldEnd.getTime()]);
    expect(confirmed.invoice?.lines.map((line) => line.kind)).toEqual(['plan', 'credit', 'addon']);
  });
});

describeIfDatabase('the renewal switch (PLN-14)', () => {
  it("switches only the shop's own add-on, until it ends, and logs it", async () => {
    const shop = await onPaidPlan(smallPlanId, smallTermId);
    await buy(shop, 'extra_products');
    const id =
      (
        await admin.query<{ id: string }>(
          'SELECT id FROM control.addon_purchases WHERE tenant_id = $1',
          [shop.tenantId],
        )
      ).rows[0]?.id ?? '';

    const other = await onPaidPlan(smallPlanId, smallTermId);
    expect((await other.patch(`/addons/mine/${id}`, { renews: false })).status).toBe(404);

    const off = await shop.patch(`/addons/mine/${id}`, { renews: false });
    expect(off.status).toBe(200);
    expect((off.body as { addons: { renewal: string }[] }).addons[0]?.renewal).toBe('off');
    const logged = await admin.query<{ summary: { renews: boolean } }>(
      "SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'addon_renewal_set'",
      [shop.tenantId],
    );
    expect(logged.rows.map((row) => row.summary)).toEqual([{ renews: false }]);

    await admin.query(
      "UPDATE control.addon_purchases SET expires_at = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    const ended = await shop.patch(`/addons/mine/${id}`, { renews: true });
    expect(ended.status).toBe(409);
    expect(errorOf(ended).code).toBe('conflict');
  });
});

describeIfDatabase('the downgrade preview with add-ons (DWN-03, PLN-14)', () => {
  it('counts the add-ons set to renew onto the smaller plan, and not the others', async () => {
    const shop = await onPaidPlan(bigPlanId, bigTermId);
    for (const name of ['One', 'Two', 'Three']) {
      const made = await shop.post('/products', {
        name,
        basePrice: 100,
        variants: [{ optionIds: [] }],
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
    }
    await buy(shop, 'extra_products');
    // Renewed onto Small, the add-on makes 1 + 500 products: the three fit.
    const fits = await shop.post('/billing/downgrade/preview', { planId: smallPlanId });
    expect(fits.status, JSON.stringify(fits.body)).toBe(201);
    expect(fits.body).toEqual([]);

    const id =
      (
        await admin.query<{ id: string }>(
          'SELECT id FROM control.addon_purchases WHERE tenant_id = $1',
          [shop.tenantId],
        )
      ).rows[0]?.id ?? '';
    expect((await shop.patch(`/addons/mine/${id}`, { renews: false })).status).toBe(200);
    const over = await shop.post('/billing/downgrade/preview', { planId: smallPlanId });
    expect(over.body).toEqual([{ key: 'products', used: 3, limit: 1 }]);
  });
});

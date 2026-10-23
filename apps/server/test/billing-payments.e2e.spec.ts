import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { HOUR_MS } from '../src/common/time';
import { PaymentQueueService } from '../src/modules/billing/services/payment-queue.service';
import { PlanPaymentsService } from '../src/modules/payments/services/plan-payments.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { getJson } from './support/http';
import { openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// BIL-19 (TENANT-DASHBOARD-DESIGN §7.13): a shop's own payments to the platform, every one from its quote on, with
// its state, method, note and invoice, in one list; the payment needing the seller on Home; another shop's payments
// are never listed (SEC-02); and the list stays open to a deleted shop's owner (BIL-13). Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_billing_payments_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const OPERATOR_ID = randomUUID();

interface ListedPayment {
  id: string;
  kind: string;
  status: string;
  state: string;
  method: string | null;
  amount: string;
  note: string | null;
  submittedAt: string | null;
  planName: string | null;
  billingTerm: { labelEn: string; labelBn: string; months: number } | null;
  invoice: { id: string; number: number } | null;
  addons: unknown[];
  earlierShop: boolean;
}

interface PaymentPage {
  payments: ListedPayment[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
let queue: PaymentQueueService;
let payments: PlanPaymentsService;
const texts = new SmsCapture();
let planId = '';
let termId = '';

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'billing-payments-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', 'Billing month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  planId =
    (
      await admin.query<{ id: string }>(
        'INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ($1, $2, true, $3) RETURNING id',
        [
          'Billing small',
          975,
          JSON.stringify({ products: 100, staff: 3, storage_mb: 100, bandwidth_gb: 10 }),
        ],
      )
    ).rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
    [planId, termId, '449.00'],
  );
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  queue = app.get(PaymentQueueService);
  payments = app.get(PlanPaymentsService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

const trx = (): string => `TX${randomUUID().replace(/-/g, '').slice(0, 10)}`;

async function quotePlan(shop: ShopClient): Promise<{ id: string; amount: string }> {
  const quoted = await shop.post('/billing/quote', { planId, billingTermId: termId });
  expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
  return quoted.body as { id: string; amount: string };
}

async function payPlanByWallet(shop: ShopClient, paymentId: string, amount: string): Promise<void> {
  const paid = await shop.post('/billing/purchase', {
    paymentId,
    method: 'wallet',
    transactionId: trx(),
    senderNumber: '01711000231',
    amountPaid: Number(amount),
  });
  expect(paid.status, JSON.stringify(paid.body)).toBe(201);
}

async function quoteTopUp(shop: ShopClient): Promise<string> {
  const quoted = await shop.post('/balance/top-up/quote', { amount: 500 });
  expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
  return (quoted.body as { id: string }).id;
}

async function confirmTopUp(shop: ShopClient, paymentId: string): Promise<void> {
  const confirmed = await shop.post('/balance/top-up/confirm', {
    paymentId,
    transactionId: trx(),
    senderNumber: '01711000231',
    amountPaid: 500,
  });
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201);
}

async function list(shop: ShopClient, query = ''): Promise<PaymentPage> {
  const page = await shop.get(`/billing/payments${query}`);
  expect(page.status, JSON.stringify(page.body)).toBe(200);
  return page.body as PaymentPage;
}

/** BIL-15's sweep, run as if a day had passed: every unsubmitted quote lapses. */
function dayPasses(): Promise<number> {
  return payments.expireStalePending(new Date(Date.now() + 25 * HOUR_MS));
}

describeIfDatabase("a shop's payments to the platform (BIL-19)", () => {
  it('lists every payment newest first, with its state, method, note and invoice', async () => {
    const shop = await openShop(port, texts, 'bill');
    await seedBalance(admin, shop.tenantId, '1000.00');

    // 1. The first plan, paid from the balance at once.
    const first = await quotePlan(shop);
    const fromBalance = await shop.post('/billing/purchase', {
      paymentId: first.id,
      method: 'balance',
    });
    expect(fromBalance.status, JSON.stringify(fromBalance.body)).toBe(201);
    // 2. A top-up the operator turns down, with a note.
    const rejected = await quoteTopUp(shop);
    await confirmTopUp(shop, rejected);
    await queue.reject(rejected, OPERATOR_ID, 'No SMS with this TrxID reached our number.');
    // 3. A renewal quoted and forgotten: it lapses.
    const lapsed = await quotePlan(shop);
    expect(await dayPasses()).toBeGreaterThanOrEqual(1);
    // 4. A renewal paid by wallet and approved.
    const renewal = await quotePlan(shop);
    await payPlanByWallet(shop, renewal.id, renewal.amount);
    await queue.approve(renewal.id, OPERATOR_ID);
    // 5. A top-up submitted and still being checked.
    const checking = await quoteTopUp(shop);
    await confirmTopUp(shop, checking);
    // 6. A renewal quoted just now, nothing submitted.
    const awaiting = await quotePlan(shop);

    const page = await list(shop);
    expect(page).toMatchObject({ page: 1, limit: 20, total: 6, pages: 1 });
    expect(page.payments.map((payment) => [payment.id, payment.state, payment.method])).toEqual([
      [awaiting.id, 'awaiting', null],
      [checking, 'checking', 'wallet'],
      [renewal.id, 'paid', 'wallet'],
      [lapsed.id, 'expired', null],
      [rejected, 'rejected', 'wallet'],
      [first.id, 'paid', 'balance'],
    ]);
    const byId = new Map(page.payments.map((payment) => [payment.id, payment]));
    expect(byId.get(first.id)).toMatchObject({
      kind: 'purchase',
      status: 'verified',
      planName: 'Billing small',
      billingTerm: { labelEn: 'Billing month', labelBn: 'মাস', months: 1 },
      submittedAt: null,
      note: null,
      addons: [],
      earlierShop: false,
    });
    expect(byId.get(first.id)?.invoice?.number).toEqual(expect.any(Number));
    expect(byId.get(renewal.id)).toMatchObject({
      kind: 'renewal',
      submittedAt: expect.any(String) as unknown,
    });
    expect(byId.get(renewal.id)?.invoice?.number).toEqual(expect.any(Number));
    expect(byId.get(rejected)).toMatchObject({
      kind: 'top_up',
      status: 'rejected',
      note: 'No SMS with this TrxID reached our number.',
      submittedAt: expect.any(String) as unknown,
      planName: null,
      billingTerm: null,
      invoice: null,
    });
    expect(byId.get(lapsed.id)).toMatchObject({ status: 'expired', submittedAt: null, note: null });
    expect(byId.get(awaiting.id)).toMatchObject({ status: 'pending', invoice: null });

    // Filters, and the page arithmetic.
    expect((await list(shop, '?state=paid')).payments.map((p) => p.id)).toEqual([
      renewal.id,
      first.id,
    ]);
    expect((await list(shop, '?kind=top_up')).total).toBe(2);
    expect((await list(shop, '?state=rejected&kind=renewal')).total).toBe(0);
    const small = await list(shop, '?limit=4&page=2');
    expect(small).toMatchObject({ page: 2, limit: 4, total: 6, pages: 2 });
    expect(small.payments.map((p) => p.id)).toEqual([rejected, first.id]);

    // The invoice names the payment it is the receipt of.
    const invoiceId = byId.get(renewal.id)?.invoice?.id ?? '';
    const invoice = await shop.get(`/billing/invoices/${invoiceId}`);
    expect(invoice.status).toBe(200);
    expect(invoice.body).toMatchObject({ planPaymentId: renewal.id, kind: 'renewal' });
  });

  it("keeps another shop's payments to itself, and the list from staff without payments:read", async () => {
    const shop = await openShop(port, texts, 'bill');
    await quoteTopUp(shop);
    expect((await list(shop)).total).toBe(1);
    const other = await openShop(port, texts, 'bill');
    expect((await list(other)).total).toBe(0);
    const headers = await staffWith(port, texts, admin, shop, ['products:read']);
    expect((await getJson(port, '/billing/payments', headers)).status).toBe(403);
  });

  it('shows the payment needing the seller on Home until they pay again', async () => {
    const shop = await openShop(port, texts, 'bill');
    const needing = async (): Promise<unknown> =>
      ((await shop.get('/home')).body as { paymentNeedingYou: unknown }).paymentNeedingYou;
    expect(await needing()).toBeNull();

    // A rejected top-up, until a new top-up is started.
    const rejected = await quoteTopUp(shop);
    await confirmTopUp(shop, rejected);
    await queue.reject(rejected, OPERATOR_ID, 'The amount did not match.');
    expect(await needing()).toEqual({
      id: rejected,
      kind: 'top_up',
      amount: '500.00',
      state: 'rejected',
    });
    const again = await quoteTopUp(shop);
    expect(await needing()).toBeNull();
    await confirmTopUp(shop, again);

    // A plan quote that lapsed, until the plan is quoted again.
    const forgotten = await quotePlan(shop);
    await dayPasses();
    expect(await needing()).toEqual({
      id: forgotten.id,
      kind: 'purchase',
      amount: forgotten.amount,
      state: 'expired',
    });
    await quotePlan(shop);
    expect(await needing()).toBeNull();
  });

  it("stays open to a deleted shop's owner (BIL-13)", async () => {
    const shop = await openShop(port, texts, 'bill');
    const paid = await quotePlan(shop);
    await payPlanByWallet(shop, paid.id, paid.amount);
    await queue.approve(paid.id, OPERATOR_ID);
    await admin.query(
      `UPDATE control.tenants SET state = 'deleted', deleted_at = now(), balance_frozen = true WHERE id = $1`,
      [shop.tenantId],
    );
    const page = await list(shop);
    expect(page.total).toBe(1);
    expect(page.payments[0]).toMatchObject({ id: paid.id, state: 'paid', earlierShop: false });
  });
});

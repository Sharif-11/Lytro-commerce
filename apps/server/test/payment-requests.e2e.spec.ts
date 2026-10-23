import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { PaymentQueueService } from '../src/modules/billing/services/payment-queue.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { postJson, type HttpResult } from './support/http';
import { openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// BIL-19 and the payment requests' rules (decided 2026-10-23, TENANT-DASHBOARD-DESIGN §7.13, §7.19): a new request
// closes the open one of its kind nothing was sent for; the shop may cancel one itself; a transaction ID goes only on an
// open request, and a turned-down payment lets go of its ID; a request is refused when its amount is not the one the
// seller was shown; and the prices read shows each plan's amount, exactly as the request would make it, without making
// a payment. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_requests_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const OPERATOR_ID = randomUUID();

let app: INestApplication;
let port: number;
let admin: pg.Client;
let queue: PaymentQueueService;
const texts = new SmsCapture();
let termId = '';
const plan = { small: '', big: '', tiny: '' };

async function seedPlan(name: string, rank: number, price: string): Promise<string> {
  const id =
    (
      await admin.query<{ id: string }>(
        'INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ($1, $2, true, $3) RETURNING id',
        [
          name,
          rank,
          JSON.stringify({ products: 100, staff: 3, storage_mb: 100, bandwidth_gb: 10 }),
        ],
      )
    ).rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
    [id, termId, price],
  );
  return id;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'payment-requests-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', 'Request month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  plan.tiny = await seedPlan('Requests tiny', 974, '299.00');
  plan.small = await seedPlan('Requests small', 975, '449.00');
  plan.big = await seedPlan('Requests big', 976, '699.00');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  queue = app.get(PaymentQueueService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

const trx = (): string => `TX${randomUUID().replace(/-/g, '').slice(0, 10)}`;

interface Payment {
  id: string;
  kind: string;
  amount: string;
  status: string;
  cancelReason: string | null;
}

function errorOf(result: HttpResult): { code: string; details: Record<string, unknown> } {
  return (result.body as { error: { code: string; details: Record<string, unknown> } }).error;
}

function created(result: HttpResult): Payment {
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Payment;
}

function quotePlan(shop: ShopClient, planId = plan.small, amount?: number): Promise<HttpResult> {
  return shop.post('/billing/quote', { planId, billingTermId: termId, amount });
}

async function quoteTopUp(shop: ShopClient): Promise<Payment> {
  return created(await shop.post('/balance/top-up/quote', { amount: 500 }));
}

function sendTopUp(
  shop: ShopClient,
  paymentId: string,
  transactionId = trx(),
): Promise<HttpResult> {
  return shop.post('/balance/top-up/confirm', {
    paymentId,
    transactionId,
    senderNumber: '01711000231',
    amountPaid: 500,
  });
}

async function statusOf(id: string): Promise<{ status: string; cancel_reason: string | null }> {
  const row = await admin.query<{ status: string; cancel_reason: string | null }>(
    'SELECT status, cancel_reason FROM control.plan_payments WHERE id = $1',
    [id],
  );
  return row.rows[0] ?? { status: 'missing', cancel_reason: null };
}

async function paymentsOf(shop: ShopClient): Promise<number> {
  const row = await admin.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM control.plan_payments WHERE tenant_id = $1',
    [shop.tenantId],
  );
  return row.rows[0]?.count ?? 0;
}

/** A shop on the small plan, paid from the balance, so it can renew, move up and move down. */
async function onSmallPlan(): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'req');
  await seedBalance(admin, shop.tenantId, '2000.00');
  const quoted = created(await quotePlan(shop));
  const paid = await shop.post('/billing/purchase', { paymentId: quoted.id, method: 'balance' });
  expect(paid.status, JSON.stringify(paid.body)).toBe(201);
  return shop;
}

describeIfDatabase('one open request per kind (BIL-19)', () => {
  it('closes the open request of the same kind nothing was sent for, and no other', async () => {
    const shop = await openShop(port, texts, 'req');
    const first = created(await quotePlan(shop));
    const topUp = await quoteTopUp(shop);
    const second = created(await quotePlan(shop, plan.big));

    expect(await statusOf(first.id)).toEqual({ status: 'cancelled', cancel_reason: 'replaced' });
    expect(await statusOf(topUp.id)).toEqual({ status: 'pending', cancel_reason: null });
    expect(await statusOf(second.id)).toEqual({ status: 'pending', cancel_reason: null });

    // A submitted request is never closed: money may have moved.
    expect((await sendTopUp(shop, topUp.id)).status).toBe(201);
    await quoteTopUp(shop);
    expect((await statusOf(topUp.id)).status).toBe('pending');

    const listed = (await shop.get('/billing/payments?state=cancelled')).body as {
      payments: { id: string; state: string; cancelReason: string }[];
    };
    expect(listed.payments.map((p) => [p.id, p.state, p.cancelReason])).toEqual([
      [first.id, 'cancelled', 'replaced'],
    ]);
  });
});

describeIfDatabase('cancelling a request (BIL-19)', () => {
  it('lets the shop close a request it sent nothing for, under the right permission', async () => {
    const shop = await openShop(port, texts, 'req');
    const quoted = created(await quotePlan(shop));
    const topUp = await quoteTopUp(shop);

    // A top-up is the balance's to close, not Billing's.
    expect((await shop.post(`/billing/payments/${topUp.id}/cancel`, {})).status).toBe(404);
    const staff = await staffWith(port, texts, admin, shop, ['payments:read']);
    expect((await postJson(port, `/billing/payments/${quoted.id}/cancel`, {}, staff)).status).toBe(
      403,
    );

    const cancelled = created(await shop.post(`/billing/payments/${quoted.id}/cancel`, {}));
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'seller' });
    created(await shop.post(`/balance/top-up/${topUp.id}/cancel`, {}));
    expect(await statusOf(topUp.id)).toEqual({ status: 'cancelled', cancel_reason: 'seller' });

    const again = await shop.post(`/billing/payments/${quoted.id}/cancel`, {});
    expect(again.status).toBe(409);
    expect(errorOf(again).code).toBe('conflict');
    const logged = await admin.query<{ action: string }>(
      `SELECT action FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'plan_payment_cancelled'`,
      [shop.tenantId],
    );
    expect(logged.rows).toHaveLength(2);
  });

  it("refuses a request already sent, and another shop's request", async () => {
    const shop = await openShop(port, texts, 'req');
    const topUp = await quoteTopUp(shop);
    expect((await sendTopUp(shop, topUp.id)).status).toBe(201);
    const sent = await shop.post(`/balance/top-up/${topUp.id}/cancel`, {});
    expect(sent.status).toBe(409);
    expect(errorOf(sent).code).toBe('conflict');

    const other = await openShop(port, texts, 'req');
    const theirs = created(await quotePlan(other));
    expect((await shop.post(`/billing/payments/${theirs.id}/cancel`, {})).status).toBe(404);
    expect((await statusOf(theirs.id)).status).toBe('pending');
  });

  it('a cancelled attempt does not clear the warning of a turned-down payment (BIL-19)', async () => {
    const shop = await openShop(port, texts, 'req');
    const needing = async (): Promise<string | null> =>
      ((await shop.get('/home')).body as { paymentNeedingYou: { id: string } | null })
        .paymentNeedingYou?.id ?? null;
    const rejected = await quoteTopUp(shop);
    expect((await sendTopUp(shop, rejected.id)).status).toBe(201);
    await queue.reject(rejected.id, OPERATOR_ID, 'The amount did not match.');
    expect(await needing()).toBe(rejected.id);

    const retry = await quoteTopUp(shop);
    expect(await needing()).toBeNull();
    created(await shop.post(`/balance/top-up/${retry.id}/cancel`, {}));
    expect(await needing()).toBe(rejected.id);
  });
});

describeIfDatabase('transaction IDs on payment requests (BIL-07, BIL-15)', () => {
  it('takes a transaction ID only on an open request', async () => {
    const shop = await openShop(port, texts, 'req');
    const replaced = await quoteTopUp(shop);
    await quoteTopUp(shop);
    const late = await postJson(
      port,
      '/balance/top-up/confirm',
      {
        paymentId: replaced.id,
        transactionId: trx(),
        senderNumber: '01711000231',
        amountPaid: 500,
      },
      shop.headers({ 'accept-language': 'en' }),
    );
    expect(late.status).toBe(409);
    expect(errorOf(late).code).toBe('conflict');
    // The seller is told to start again, or to keep money already sent with Top up.
    expect((late.body as { error: { message: string } }).error.message).toContain('Top up');
  });

  it('lets a turned-down payment go of its transaction ID, but never an approved one', async () => {
    const shop = await openShop(port, texts, 'req');
    const id = trx();
    const first = await quoteTopUp(shop);
    expect((await sendTopUp(shop, first.id, id)).status).toBe(201);
    await queue.reject(first.id, OPERATOR_ID, 'The SMS had not arrived yet.');

    // The same transaction ID, sent again once support's note is dealt with.
    const second = await quoteTopUp(shop);
    expect((await sendTopUp(shop, second.id, id)).status).toBe(201);
    await queue.approve(second.id, OPERATOR_ID);

    const third = await quoteTopUp(shop);
    const reused = await sendTopUp(shop, third.id, id);
    expect(reused.status).toBe(409);
    expect(errorOf(reused).code).toBe('conflict');
  });
});

describeIfDatabase('the amount the seller was shown (BIL-09, UPG-07)', () => {
  it('refuses a request whose amount is not the one shown, and makes no payment', async () => {
    const shop = await openShop(port, texts, 'req');
    const before = await paymentsOf(shop);
    const changed = await quotePlan(shop, plan.small, 400);
    expect(changed.status).toBe(409);
    expect(errorOf(changed)).toMatchObject({ code: 'conflict', details: { amount: '449.00' } });
    expect(await paymentsOf(shop)).toBe(before);

    expect(created(await quotePlan(shop, plan.small, 449)).amount).toBe('449.00');
    // Without an amount nothing is compared (auto-renew prices for itself).
    expect(created(await quotePlan(shop)).amount).toBe('449.00');
  });
});

describeIfDatabase('the prices read (BIL-01, UPG-03, PLN-14)', () => {
  interface Priced {
    planId: string;
    move: string;
    price: string;
    amount: string | null;
    credit: string | null;
    blockedBy: string | null;
  }
  const pricesOf = async (shop: ShopClient): Promise<Map<string, Priced>> => {
    const read = await shop.get(`/billing/prices?billingTermId=${termId}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    return new Map((read.body as Priced[]).map((option) => [option.planId, option]));
  };

  it('prices every plan as a purchase on a trial, without making a payment', async () => {
    const shop = await openShop(port, texts, 'req');
    const before = await paymentsOf(shop);
    const prices = await pricesOf(shop);
    expect(prices.get(plan.small)).toMatchObject({
      move: 'purchase',
      price: '449.00',
      amount: '449.00',
      blockedBy: null,
    });
    expect(prices.get(plan.big)?.move).toBe('purchase');
    expect(await paymentsOf(shop)).toBe(before);
    expect((await shop.get(`/billing/prices?billingTermId=${randomUUID()}`)).status).toBe(404);
  });

  it('prices renewing, moving up and moving down exactly as the request would make them', async () => {
    const shop = await onSmallPlan();
    const before = await paymentsOf(shop);
    const prices = await pricesOf(shop);
    expect(await paymentsOf(shop)).toBe(before);

    expect(prices.get(plan.tiny)).toMatchObject({ move: 'downgrade', amount: null });
    const renewal = prices.get(plan.small);
    expect(renewal).toMatchObject({ move: 'renewal', amount: '449.00' });
    const upgrade = prices.get(plan.big);
    expect(upgrade).toMatchObject({ move: 'upgrade', price: '699.00', blockedBy: null });
    expect(Number(upgrade?.credit)).toBeGreaterThan(0);

    // The request holds exactly what was shown.
    const renewed = created(await quotePlan(shop, plan.small, Number(renewal?.amount)));
    expect(renewed).toMatchObject({ kind: 'renewal', amount: renewal?.amount });
    const upgraded = created(
      await shop.post('/billing/upgrade/quote', {
        planId: plan.big,
        billingTermId: termId,
        amount: Number(upgrade?.amount),
      }),
    );
    expect(upgraded).toMatchObject({ kind: 'upgrade', amount: upgrade?.amount });

    // Once an upgrade is sent for checking, the read says another cannot start.
    const sent = await shop.post('/billing/upgrade/confirm', {
      paymentId: upgraded.id,
      method: 'wallet',
      transactionId: trx(),
      senderNumber: '01711000231',
      amountPaid: Number(upgraded.amount),
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect((await pricesOf(shop)).get(plan.big)?.blockedBy).toBe('UpgradePending');
  });
});

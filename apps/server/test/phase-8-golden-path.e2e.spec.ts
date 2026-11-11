import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, postJson, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { openShop } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 8's golden path (PHASE-8-PLAN §1, criterion 3), as one test: a seller pays Lytro outside the flow, the operator
// records it with evidence and a reason, the plan is active with its invoice, the shop's activity log shows it and its
// owner is told, and it appears in the operator's list of entries and in that month's revenue report. On the way it
// checks criterion 2's guards (the transaction ID is used once platform-wide, sending the entry twice moves no money
// twice) and criterion 5's (the reason is kept in the platform audit log). Runs only with DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_phase8_golden_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 90_000, hookTimeout: 180_000 });

const PASSWORD = 'golden-pass-8';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PRICE = '800.00';
const REASON = 'Paid to the bKash wallet while the listener phone was off';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
let operatorId = '';
let walletId = '';
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'golden8-e2e-otp-secret-01234567890123456';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  const email = `golden.${randomUUID().slice(0, 8)}@lytronix.internal`;
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
  operatorId =
    (
      await admin.query<{ id: string }>(
        'SELECT id FROM control.operator_accounts WHERE email = $1',
        [email],
      )
    ).rows[0]?.id ?? '';
  walletId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.platform_wallets (provider, number) VALUES ('bkash', '01700000000') RETURNING id`,
      )
    ).rows[0]?.id ?? '';
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** A plan for sale at PRICE for one month. */
async function seedPlan(): Promise<{ planId: string; billingTermId: string }> {
  const plan = await admin.query<{ id: string }>(
    `INSERT INTO control.plans (name, rank, for_sale, version, limits, features)
     VALUES ('Golden Plan', 4242, true, 1, '{"paired_devices": 1}', '{}') RETURNING id`,
  );
  const term = await admin.query<{ id: string }>(
    `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
     VALUES ('এক মাস', 'One month golden', 1, true, 0) RETURNING id`,
  );
  const planId = plan.rows[0]?.id ?? '';
  const billingTermId = term.rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
    [planId, billingTermId, PRICE],
  );
  return { planId, billingTermId };
}

/** A day in Asia/Dhaka, as the reports take it. */
function dhakaDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(at);
}

function operatorGet(path: string): Promise<HttpResult> {
  return getJson(port, path, operator);
}

function operatorPost(path: string, body: unknown): Promise<HttpResult> {
  return postJson(port, path, body, operator);
}

interface Figures {
  manual: Record<string, string>;
  wallet: Record<string, string>;
  earned: string;
}

describeIfDatabase("Phase 8's golden path (criterion 3)", () => {
  it('a payment made outside the flow, recorded by the operator, reaches the shop, its owner and the reports', async () => {
    const plan = await seedPlan();
    const seller = await openShop(port, texts, 'gold');
    const startedAt = new Date();

    // 1. The seller paid Lytro's wallet, but no claim reached the queue: there is nothing to approve.
    const queued = (await operatorGet('/operator/payment-queue')).body as { tenantId?: string }[];
    expect(queued.filter((row) => row.tenantId === seller.tenantId)).toHaveLength(0);
    expect((await seller.get('/billing/invoices')).body).toEqual([]);

    // 2. The operator records it with the screenshot the seller sent them, and a reason.
    const started = await operatorPost('/operator/manual-entries/evidence', {
      contentType: 'image/jpeg',
      bytes: JPEG.length,
    });
    expect(started.status, JSON.stringify(started.envelope)).toBe(201);
    const { key, upload } = started.body as { key: string; upload: { url: string } };
    expect(storage.send(upload.url, JPEG, 'image/jpeg')).toBe(200);
    const transactionId = `GOLD${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    const body = {
      tenantId: seller.tenantId,
      kind: 'plan',
      ...plan,
      amount: Number(PRICE),
      amountConfirmation: Number(PRICE),
      walletId,
      transactionId,
      senderNumber: '01712345678',
      paidAt: new Date(Date.now() - 3_600_000).toISOString(),
      evidenceKey: key,
      reason: REASON,
    };
    const made = await operatorPost('/operator/manual-entries', body);
    expect(made.status, JSON.stringify(made.envelope)).toBe(201);
    const entry = made.body as {
      id: string;
      planPaymentId: string;
      kind: string;
      evidenceId: string | null;
    };
    expect(entry.kind).toBe('purchase');
    expect(entry.evidenceId).not.toBeNull();

    // Sent again, a second click: refused, as its screenshot has already gone to the private store.
    const again = await operatorPost('/operator/manual-entries', body);
    expect(again.status, JSON.stringify(again.envelope)).toBe(400);
    // A second operator with the same statement and a screenshot of their own: refused, as its transaction ID is used.
    const second = await operatorPost('/operator/manual-entries/evidence', {
      contentType: 'image/jpeg',
      bytes: JPEG.length,
    });
    const secondUpload = second.body as { key: string; upload: { url: string } };
    expect(storage.send(secondUpload.upload.url, JPEG, 'image/jpeg')).toBe(200);
    const twice = await operatorPost('/operator/manual-entries', {
      ...body,
      evidenceKey: secondUpload.key,
    });
    expect(twice.status, JSON.stringify(twice.envelope)).toBe(409);

    // 3. The plan is active for a period, through the same activation as the queue's approval.
    const { rows: shops } = await admin.query<{ state: string; plan_id: string; period_end: Date }>(
      'SELECT state, plan_id, period_end FROM control.tenants WHERE id = $1',
      [seller.tenantId],
    );
    expect(shops[0]).toMatchObject({ state: 'active', plan_id: plan.planId });
    expect(shops[0]?.period_end.getTime()).toBeGreaterThan(Date.now() + 25 * 86_400_000);
    const { rows: paid } = await admin.query<{ status: string; recorded_by_platform: boolean }>(
      'SELECT status, recorded_by_platform FROM control.plan_payments WHERE tenant_id = $1',
      [seller.tenantId],
    );
    expect(paid).toEqual([{ status: 'verified', recorded_by_platform: true }]);

    // ... with its invoice, which the seller reads.
    const invoices = (await seller.get('/billing/invoices')).body as {
      kind: string;
      amount: string;
      recordedByPlatform: boolean;
    }[];
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      kind: 'purchase',
      amount: PRICE,
      recordedByPlatform: true,
    });

    // 4. The shop's activity log shows it, done by Lytro's support, as the owner reads it.
    const activity = (await seller.get('/activity')).body as {
      entries: { action: string; actorType: string }[];
    };
    expect(activity.entries.filter((row) => row.action === 'manual_payment_recorded')).toEqual([
      expect.objectContaining({ actorType: 'platform_support' }),
    ]);

    // ... and the owner is told, in the bell.
    const bell = (await seller.get('/notifications')).body as {
      items: { title: string; body: string; read: boolean }[];
    };
    const told = bell.items.filter((item) =>
      ['Your payment has been recorded', 'আপনার পেমেন্ট রেকর্ড হয়েছে'].includes(item.title),
    );
    expect(told).toHaveLength(1);
    expect(told[0]?.body).toMatch(/800\.00/);
    expect(told[0]?.read).toBe(false);

    // 5. It is in the operator's list of entries, with the reason, who recorded it, and the screenshot behind a link.
    const listed = (await operatorGet(`/operator/manual-entries?tenantId=${seller.tenantId}`))
      .body as {
      entries: {
        id: string;
        reason: string;
        enteredBy: string;
        transactionId: string;
        evidenceId: string;
      }[];
      total: number;
    };
    expect(listed.total).toBe(1);
    expect(listed.entries[0]).toMatchObject({
      id: entry.id,
      reason: REASON,
      enteredBy: operatorId,
      transactionId,
    });
    const link = await operatorGet(`/operator/manual-entries/${entry.id}/evidence`);
    expect(link.status).toBe(200);
    expect((link.body as { url: string }).url).toMatch(/^memory:\/\/evidence\//);

    // ... and the platform audit log keeps the reason (criterion 5).
    const audit = (
      await operatorGet(`/operator/audit?tenantId=${seller.tenantId}&action=manual_entry_recorded`)
    ).body as {
      items: { actorId: string; summary: { reason?: string; transactionId?: string } }[];
    };
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0]).toMatchObject({
      actorId: operatorId,
      summary: expect.objectContaining({ reason: REASON, transactionId }) as unknown,
    });

    // 6. That month's revenue report counts it once, apart, as earned.
    const finishedAt = new Date();
    const month = await operatorGet(
      `/operator/reports/revenue?dateFrom=${dhakaDay(startedAt).slice(0, 8)}01&dateTo=${dhakaDay(finishedAt)}&bucket=month`,
    );
    expect(month.status, JSON.stringify(month.envelope)).toBe(200);
    const report = month.body as {
      buckets: (Figures & { from: string; to: string })[];
      total: Figures;
    };
    expect(report.total.manual).toEqual({
      plans: PRICE,
      plansReversed: '0.00',
      topUps: '0.00',
      topUpsReversed: '0.00',
    });
    expect(report.total.wallet['purchase']).toBe('0.00');
    expect(report.total.earned).toBe(PRICE);
    const day = dhakaDay(finishedAt);
    expect(report.buckets.find((bucket) => bucket.from <= day && bucket.to >= day)?.earned).toBe(
      PRICE,
    );

    // 7. The transaction ID stays used platform-wide: the seller's own "I have paid" with it later is refused.
    const quote = await seller.post('/balance/top-up/quote', { amount: 500 });
    expect(quote.status, JSON.stringify(quote.envelope)).toBe(201);
    const claim = await seller.post('/balance/top-up/confirm', {
      paymentId: (quote.body as { id: string }).id,
      transactionId,
      senderNumber: '01712345678',
      amountPaid: 500,
    });
    expect(claim.status, JSON.stringify(claim.envelope)).toBe(409);
    const { rows: balance } = await admin.query<{ balance_amount: string }>(
      'SELECT balance_amount FROM control.tenants WHERE id = $1',
      [seller.tenantId],
    );
    expect(balance[0]?.balance_amount).toBe('0.00');
    expect((await seller.get('/billing/invoices')).body).toHaveLength(1);
  });
});

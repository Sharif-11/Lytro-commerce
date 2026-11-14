import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PUBLISHED_PRIVACY_VERSIONS, PUBLISHED_TERMS_VERSIONS } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { PaymentQueueService } from '../src/modules/billing/services/payment-queue.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { cookieFrom, getJson, patchJson, postJson, type HttpResult } from './support/http';
import { fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 9 Slice 9.8 (the read, 2026-11-13): the terms and privacy versions in force, read without a session by the website and
// settable only to a published version (LEG-01); every top-up invoiced (BIL-12); and VAT on Lytro's invoices once the operator
// has set all four VAT settings, included in the price, none on what the balance paid (D9-7, LEG-03). Runs only with
// DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_terms_and_tax_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = 'terms-tax-op-9';
const OPERATOR_ID = randomUUID();
const NEWEST_TERMS = PUBLISHED_TERMS_VERSIONS[PUBLISHED_TERMS_VERSIONS.length - 1];
const NEWEST_PRIVACY = PUBLISHED_PRIVACY_VERSIONS[PUBLISHED_PRIVACY_VERSIONS.length - 1];
const VAT_KEYS = ['vat_bin', 'vat_rate', 'vat_seller_name', 'vat_seller_address'];

let app: INestApplication;
let port: number;
let admin: pg.Client;
let queue: PaymentQueueService;
let operator: Record<string, string> = {};
const texts = new SmsCapture();
let planId = '';
let termId = '';

interface Invoice {
  id: string;
  kind: string;
  amount: string;
  paymentMethod: string | null;
  planPaymentId: string | null;
  shopAddress: string | null;
  sellerName: string | null;
  sellerAddress: string | null;
  sellerBin: string | null;
  vatRate: string | null;
  vatAmount: string | null;
  lines: { kind: string; description: string; quantity: number; amount: string }[];
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'terms-and-tax-e2e-otp-secret-0123456789012345';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', 'Tax month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  planId =
    (
      await admin.query<{ id: string }>(
        'INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ($1, $2, true, $3) RETURNING id',
        [
          'Tax small',
          976,
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
  operator = await operatorHeaders();
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

async function operatorHeaders(): Promise<Record<string, string>> {
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, await hash(PASSWORD, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', { email, password: PASSWORD });
  expect(signedIn.status, JSON.stringify(signedIn.body)).toBeLessThan(300);
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

const set = (key: string, value: unknown): Promise<HttpResult> =>
  patchJson(port, `/operator/settings/${key}`, { value, reason: 'Slice 9.8 test' }, operator);

const trx = (): string => `TX${randomUUID().replace(/-/g, '').slice(0, 10)}`;

/** A top-up of `amount` submitted by wallet and approved by the operator; its payment's ID. */
async function toppedUp(shop: ShopClient, amount: number): Promise<string> {
  const quoted = await shop.post('/balance/top-up/quote', { amount });
  expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
  const paymentId = (quoted.body as { id: string }).id;
  const confirmed = await shop.post('/balance/top-up/confirm', {
    paymentId,
    transactionId: trx(),
    senderNumber: '01711000231',
    amountPaid: amount,
  });
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201);
  await queue.approve(paymentId, OPERATOR_ID);
  return paymentId;
}

/** The plan bought from the balance (`balance`) or by wallet and approved. */
async function boughtPlan(shop: ShopClient, method: 'balance' | 'wallet'): Promise<string> {
  const quoted = await shop.post('/billing/quote', { planId, billingTermId: termId });
  expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
  const { id, amount } = quoted.body as { id: string; amount: string };
  const paid = await shop.post(
    '/billing/purchase',
    method === 'balance'
      ? { paymentId: id, method }
      : {
          paymentId: id,
          method,
          transactionId: trx(),
          senderNumber: '01711000231',
          amountPaid: Number(amount),
        },
  );
  expect(paid.status, JSON.stringify(paid.body)).toBe(201);
  if (method === 'wallet') await queue.approve(id, OPERATOR_ID);
  return id;
}

async function invoiceFor(shop: ShopClient, paymentId: string): Promise<Invoice> {
  const listed = await shop.get('/billing/invoices');
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  const invoice = (listed.body as Invoice[]).find((each) => each.planPaymentId === paymentId);
  if (!invoice) throw new Error(`no invoice for payment ${paymentId}`);
  return invoice;
}

async function registered(): Promise<void> {
  for (const [key, value] of [
    ['vat_bin', '123456789-0101'],
    ['vat_rate', '15'],
    ['vat_seller_name', 'Lytro'],
    ['vat_seller_address', 'House 1, Road 2, Dhaka 1207'],
  ] as const) {
    const answer = await set(key, value);
    expect(answer.status, `${key}: ${JSON.stringify(answer.body)}`).toBe(200);
  }
}

async function unregistered(): Promise<void> {
  for (const key of VAT_KEYS) expect((await set(key, '')).status).toBe(200);
}

describeIfDatabase('the terms and privacy versions in force (LEG-01, Slice 9.8)', () => {
  it('answers anyone with the newest published versions, which the migration set, and may be cached', async () => {
    const answered = await getJson(port, '/legal-versions', { host: 'localhost' });
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    expect(answered.body).toEqual({ termsVersion: NEWEST_TERMS, privacyVersion: NEWEST_PRIVACY });
    expect(answered.headers['cache-control']).toBe('public, max-age=300');
  });

  it('sets a version only when its text is published', async () => {
    for (const key of ['terms_version', 'privacy_version']) {
      const refused = await set(key, '2099-01-01');
      expect(refused.status, JSON.stringify(refused.body)).toBe(400);
      expect(fieldsOf(refused)).toEqual({ value: 'invalid_format' });
    }
    expect((await set('terms_version', NEWEST_TERMS)).status).toBe(200);
    expect((await set('privacy_version', NEWEST_PRIVACY)).status).toBe(200);
  });
});

describeIfDatabase("every top-up invoiced, and VAT on Lytro's invoices (BIL-12, D9-7)", () => {
  it('invoices a credited top-up as its receipt, with no VAT while Lytro is not registered', async () => {
    const shop = await openShop(port, texts, 'taxa');
    const paymentId = await toppedUp(shop, 500);
    const invoice = await invoiceFor(shop, paymentId);
    expect(invoice).toMatchObject({
      kind: 'top_up',
      amount: '500.00',
      paymentMethod: 'wallet',
      sellerName: null,
      sellerAddress: null,
      sellerBin: null,
      vatRate: null,
      vatAmount: null,
      lines: [{ kind: 'top_up', description: 'Balance top-up', quantity: 1, amount: '500.00' }],
    });
    // The payment lists its receipt, as a plan's does.
    const listed = (await shop.get('/billing/payments?kind=top_up')).body as {
      payments: { id: string; invoice: { id: string } | null }[];
    };
    expect(listed.payments.find((payment) => payment.id === paymentId)?.invoice?.id).toBe(
      invoice.id,
    );
  });

  it('refuses a BIN, rate, name or address it could not print, and takes each cleared', async () => {
    const refused: [string, unknown][] = [
      ['vat_bin', '12345678'],
      ['vat_bin', '1234567890'],
      ['vat_bin', 123456789],
      ['vat_rate', '0'],
      ['vat_rate', '100.01'],
      ['vat_rate', '7.555'],
      ['vat_rate', 15],
      ['vat_seller_name', 'Lytro\nLtd'],
      ['vat_seller_name', ' Lytro'],
      ['vat_seller_name', 'x'.repeat(121)],
      ['vat_seller_address', 'y'.repeat(301)],
    ];
    for (const [key, value] of refused) {
      expect((await set(key, value)).status, `${key} = ${JSON.stringify(value)}`).toBe(400);
    }
    for (const [key, value] of [
      ['vat_bin', '123456789'],
      ['vat_bin', '1234567890123'],
      ['vat_rate', '7.5'],
      ['vat_rate', '100'],
    ] as const) {
      expect((await set(key, value)).status, `${key} = ${value}`).toBe(200);
    }
    await unregistered();
  });

  it('carries VAT, included in the price, on money that came in; none on a plan paid from the balance', async () => {
    const shop = await openShop(port, texts, 'taxb');
    await registered();
    try {
      // 500 x 15 / 115 = 65.2173..., rounded to the paisa.
      const topUp = await invoiceFor(shop, await toppedUp(shop, 500));
      expect(topUp).toMatchObject({
        amount: '500.00',
        sellerName: 'Lytro',
        sellerAddress: 'House 1, Road 2, Dhaka 1207',
        sellerBin: '123456789-0101',
        vatRate: '15.00',
        vatAmount: '65.22',
      });
      // 449 x 15 / 115 = 58.5652...
      const byWallet = await invoiceFor(shop, await boughtPlan(shop, 'wallet'));
      expect(byWallet).toMatchObject({ amount: '449.00', vatRate: '15.00', vatAmount: '58.57' });
      // The balance's money was invoiced, with its VAT, when it came in.
      await seedBalance(admin, shop.tenantId, '1000.00');
      const fromBalance = await invoiceFor(shop, await boughtPlan(shop, 'balance'));
      expect(fromBalance).toMatchObject({
        paymentMethod: 'balance',
        sellerBin: null,
        vatRate: null,
        vatAmount: null,
      });

      // Any one setting cleared and Lytro's invoices carry none again; the ones issued keep theirs.
      expect((await set('vat_rate', '')).status).toBe(200);
      const after = await invoiceFor(shop, await toppedUp(shop, 300));
      expect(after).toMatchObject({ amount: '300.00', vatRate: null, vatAmount: null });
      expect((await invoiceFor(shop, byWallet.planPaymentId ?? '')).vatAmount).toBe('58.57');
    } finally {
      await unregistered();
    }
  });

  it("copies the shop's address at issue as Mushak-6.3's buyer, and a later move never changes it (Slice 9.9)", async () => {
    const shop = await openShop(port, texts, 'taxd');
    // No address set yet: the invoice says none.
    expect((await invoiceFor(shop, await toppedUp(shop, 200))).shopAddress).toBeNull();
    await admin.query('UPDATE control.tenants SET business_address = $2 WHERE id = $1', [
      shop.tenantId,
      'Shop 12, Rapa Plaza, Dhanmondi, Dhaka',
    ]);
    const first = await invoiceFor(shop, await toppedUp(shop, 300));
    expect(first.shopAddress).toBe('Shop 12, Rapa Plaza, Dhanmondi, Dhaka');
    await admin.query('UPDATE control.tenants SET business_address = $2 WHERE id = $1', [
      shop.tenantId,
      'House 3, Road 1, Gulshan, Dhaka',
    ]);
    expect((await invoiceFor(shop, await toppedUp(shop, 400))).shopAddress).toBe(
      'House 3, Road 1, Gulshan, Dhaka',
    );
    expect((await invoiceFor(shop, first.planPaymentId ?? '')).shopAddress).toBe(
      'Shop 12, Rapa Plaza, Dhanmondi, Dhaka',
    );
  });

  it('holds the five VAT fields together in the database: all or none', async () => {
    const shop = await openShop(port, texts, 'taxc');
    const invoice = await invoiceFor(shop, await toppedUp(shop, 200));
    await expect(
      admin.query("UPDATE control.invoices SET vat_rate = '15' WHERE id = $1", [invoice.id]),
    ).rejects.toThrow(/invoices_vat_check/);
  });
});

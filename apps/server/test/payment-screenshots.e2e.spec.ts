import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import type { HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// ADM-17, D8-15 (Phase 8 Slice 8.8): since #337 a payment is sent on the payment page, which takes no screenshot, so
// Billing offers one afterwards: for a payment of the shop's own that Lytro is still checking, one a payment, kept once
// sent. Billing's list says when it was sent. Runs only with DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_screenshots_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const storage = new MemoryStorage();
let planId = '';
let billingTermId = '';

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'screenshots-e2e-otp-secret-012345678901234';
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
  const plan = await admin.query<{ id: string }>(
    `INSERT INTO control.plans (name, rank, for_sale, version, limits, features)
     VALUES ($1, $2, true, 1, '{"paired_devices": 1}', '{}') RETURNING id`,
    [`Screenshot Plan ${fresh()}`, Math.floor(Math.random() * 100000) + 1000],
  );
  const term = await admin.query<{ id: string }>(
    `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
     VALUES ('মাস', $1, 1, true, 0) RETURNING id`,
    [`1-month ${fresh()}`],
  );
  planId = plan.rows[0]?.id ?? '';
  billingTermId = term.rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, 449)',
    [planId, billingTermId],
  );
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

function fresh(): string {
  return randomUUID().replace(/-/g, '').slice(0, 14).toUpperCase();
}

function shop(): Promise<ShopClient> {
  return openShop(port, texts, 'shot');
}

/** The server's sentence for this key, in whichever language the call was answered in. */
function says(result: HttpResult, key: MessageKey): void {
  expect([translate(key, 'en'), translate(key, 'bn')]).toContain(errorOf(result).message);
}

/** A top-up sent with its transaction ID, which Lytro is now checking. */
async function topUpSent(client: ShopClient): Promise<string> {
  const quoted = await client.post('/balance/top-up/quote', { amount: 500 });
  expect(quoted.status, JSON.stringify(quoted.envelope)).toBe(201);
  const id = (quoted.body as { id: string }).id;
  const sent = await client.post('/balance/top-up/confirm', {
    paymentId: id,
    transactionId: fresh(),
    senderNumber: '01712345678',
    amountPaid: 500,
  });
  expect(sent.status, JSON.stringify(sent.envelope)).toBe(201);
  return id;
}

/** A plan's payment quoted; sent with its transaction ID too unless `send` is false. */
async function planPayment(client: ShopClient, send = true): Promise<string> {
  const quoted = await client.post('/billing/quote', { planId, billingTermId });
  expect(quoted.status, JSON.stringify(quoted.envelope)).toBe(201);
  const id = (quoted.body as { id: string }).id;
  if (send) {
    const sent = await client.post('/billing/purchase', {
      paymentId: id,
      method: 'wallet',
      transactionId: fresh(),
      senderNumber: '01712345678',
      amountPaid: 449,
    });
    expect(sent.status, JSON.stringify(sent.envelope)).toBe(201);
  }
  return id;
}

/** A file sent to the store by the upload link the given route signs; its key. */
async function uploaded(client: ShopClient, route: string, body: Buffer = JPEG): Promise<string> {
  const started = await client.post(route, { contentType: 'image/jpeg', bytes: body.length });
  expect(started.status, JSON.stringify(started.envelope)).toBe(201);
  const { key, upload } = started.body as { key: string; upload: { url: string } };
  expect(storage.send(upload.url, body, 'image/jpeg')).toBe(200);
  return key;
}

const TOP_UP_LINK = '/balance/top-up/evidence';
const PLAN_LINK = '/billing/payment-evidence';

async function evidenceOf(paymentId: string): Promise<string | null> {
  const row = await admin.query<{ evidence_id: string | null }>(
    'SELECT evidence_id FROM control.plan_payments WHERE id = $1',
    [paymentId],
  );
  return row.rows[0]?.evidence_id ?? null;
}

async function listed(client: ShopClient, paymentId: string) {
  const page = await client.get('/billing/payments?limit=50');
  expect(page.status, JSON.stringify(page.envelope)).toBe(200);
  const rows = (page.body as { payments: { id: string; evidenceSentAt: string | null }[] })
    .payments;
  const row = rows.find((payment) => payment.id === paymentId);
  if (!row) throw new Error(`payment ${paymentId} not listed`);
  return row;
}

describeIfDatabase("a payment's screenshot after it was sent (ADM-17, D8-15)", () => {
  it('goes on a top-up Lytro is checking, and Billing says when it was sent', async () => {
    const client = await shop();
    const paymentId = await topUpSent(client);
    expect((await listed(client, paymentId)).evidenceSentAt).toBeNull();
    const key = await uploaded(client, TOP_UP_LINK);
    const sent = await client.post(`/balance/top-up/${paymentId}/evidence`, { evidenceKey: key });
    expect(sent.status, JSON.stringify(sent.envelope)).toBe(201);
    const { evidenceSentAt } = sent.body as { evidenceSentAt: string };
    expect(Number.isNaN(Date.parse(evidenceSentAt))).toBe(false);
    expect(await evidenceOf(paymentId)).not.toBeNull();
    expect(storage.uploads.has(key)).toBe(false);
    expect((await listed(client, paymentId)).evidenceSentAt).toBe(evidenceSentAt);
  });

  it("goes on a plan's payment Lytro is checking", async () => {
    const client = await shop();
    const paymentId = await planPayment(client);
    const key = await uploaded(client, PLAN_LINK);
    const sent = await client.post(`/billing/payments/${paymentId}/evidence`, { evidenceKey: key });
    expect(sent.status, JSON.stringify(sent.envelope)).toBe(201);
    expect(await evidenceOf(paymentId)).not.toBeNull();
    expect((await listed(client, paymentId)).evidenceSentAt).toBe(
      (sent.body as { evidenceSentAt: string }).evidenceSentAt,
    );
  });

  it('is one a payment: a second is refused, keeping nothing, and the upload stays', async () => {
    const client = await shop();
    const paymentId = await topUpSent(client);
    const first = await uploaded(client, TOP_UP_LINK);
    expect(
      (await client.post(`/balance/top-up/${paymentId}/evidence`, { evidenceKey: first })).status,
    ).toBe(201);
    const kept = await evidenceOf(paymentId);
    const stored = storage.evidence.size;
    const second = await uploaded(client, TOP_UP_LINK);
    const refused = await client.post(`/balance/top-up/${paymentId}/evidence`, {
      evidenceKey: second,
    });
    expect(refused.status).toBe(409);
    says(refused, 'EvidenceAlreadySent');
    expect(storage.evidence.size).toBe(stored);
    expect(storage.uploads.has(second)).toBe(true);
    expect(await evidenceOf(paymentId)).toBe(kept);
  });

  it('is refused on a payment nothing was sent for, and on one Lytro has decided', async () => {
    const client = await shop();
    const awaiting = await planPayment(client, false);
    const key = await uploaded(client, PLAN_LINK);
    const stored = storage.evidence.size;
    const early = await client.post(`/billing/payments/${awaiting}/evidence`, {
      evidenceKey: key,
    });
    expect(early.status).toBe(409);
    says(early, 'PaymentNotBeingChecked');

    const decided = await topUpSent(client);
    await admin.query(
      `UPDATE control.plan_payments SET status = 'rejected', verified_at = now() WHERE id = $1`,
      [decided],
    );
    const topUpKey = await uploaded(client, TOP_UP_LINK);
    const late = await client.post(`/balance/top-up/${decided}/evidence`, {
      evidenceKey: topUpKey,
    });
    expect(late.status).toBe(409);
    says(late, 'PaymentNotBeingChecked');
    expect(storage.evidence.size).toBe(stored);
    expect(await evidenceOf(awaiting)).toBeNull();
    expect(await evidenceOf(decided)).toBeNull();
  });

  it("answers not found for another shop's payment and for a payment of the other route's kind", async () => {
    const owner = await shop();
    const other = await shop();
    const theirs = await topUpSent(other);
    const key = await uploaded(owner, TOP_UP_LINK);
    const stored = storage.evidence.size;
    const foreign = await owner.post(`/balance/top-up/${theirs}/evidence`, { evidenceKey: key });
    expect(foreign.status).toBe(404);
    says(foreign, 'PlanPaymentNotFound');

    const topUp = await topUpSent(owner);
    const plan = await planPayment(owner);
    const planKey = await uploaded(owner, PLAN_LINK);
    expect(
      (await owner.post(`/billing/payments/${topUp}/evidence`, { evidenceKey: planKey })).status,
    ).toBe(404);
    expect(
      (await owner.post(`/balance/top-up/${plan}/evidence`, { evidenceKey: key })).status,
    ).toBe(404);
    expect(storage.evidence.size).toBe(stored);
    expect(await evidenceOf(theirs)).toBeNull();
    expect(await evidenceOf(topUp)).toBeNull();
    expect(await evidenceOf(plan)).toBeNull();
  });

  it("refuses another shop's upload and a file that is not a picture or a PDF", async () => {
    const owner = await shop();
    const other = await shop();
    const paymentId = await topUpSent(owner);
    const theirs = await uploaded(other, TOP_UP_LINK);
    expect(
      (await owner.post(`/balance/top-up/${paymentId}/evidence`, { evidenceKey: theirs })).status,
    ).toBe(400);
    const fake = await uploaded(owner, TOP_UP_LINK, Buffer.from('<html>not a picture</html>'));
    const refused = await owner.post(`/balance/top-up/${paymentId}/evidence`, {
      evidenceKey: fake,
    });
    expect(refused.status).toBe(400);
    says(refused, 'EvidenceNotAllowed');
    expect(await evidenceOf(paymentId)).toBeNull();
  });
});

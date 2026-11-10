import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { PaymentEvidence } from '../src/modules/payment-evidence/services/payment-evidence';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, deleteJson, getJson, postJson, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// ADM-14 to ADM-17, D8-14, D8-15, D8-47 to D8-56 (Phase 8 Slice 8.5, read agreed 2026-11-09): a payment the operator records
// goes through the queue's own activation and is undone by a reversing entry; a seller's "I have paid" may carry a
// screenshot; screenshots stay private and go after two years. Runs only with DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_manual_entries_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const PASSWORD = 'manual-pass-1';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

let app: INestApplication;
let port: number;
let admin: pg.Client;
let appRole: pg.Client;
let operator: Record<string, string> = {};
let operatorId = '';
let walletId = '';
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'manual-e2e-otp-secret-0123456789012345678';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  appRole = new pg.Client({ connectionString: urls.appDbUrl });
  await appRole.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
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
  await appRole.end();
  await admin.end();
});

const fresh = (): string => randomUUID().replace(/-/g, '').slice(0, 14).toUpperCase();

function shop(): Promise<ShopClient> {
  return openShop(port, texts, 'man');
}

async function seedPlan(months: number, price: string, rank?: number) {
  const plan = await admin.query<{ id: string }>(
    `INSERT INTO control.plans (name, rank, for_sale, version, limits, features)
     VALUES ($1, $2, true, 1, '{"paired_devices": 1}', '{}') RETURNING id`,
    [`Manual Plan ${fresh()}`, rank ?? Math.floor(Math.random() * 100000) + 1000],
  );
  const term = await admin.query<{ id: string }>(
    `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
     VALUES ('মাস', $1, $2, true, 0) RETURNING id`,
    [`${String(months)}-month ${fresh()}`, months],
  );
  const planId = plan.rows[0]?.id ?? '';
  const billingTermId = term.rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
    [planId, billingTermId, price],
  );
  return { planId, billingTermId };
}

function operatorPost(path: string, body: unknown): Promise<HttpResult> {
  return postJson(port, path, body, operator);
}

/** A screenshot, sent to its signed link as the console does. */
async function uploaded(body: Buffer = JPEG, contentType = 'image/jpeg'): Promise<string> {
  const started = await operatorPost('/operator/manual-entries/evidence', {
    contentType,
    bytes: body.length,
  });
  expect(started.status, JSON.stringify(started.envelope)).toBe(201);
  const { key, upload } = started.body as { key: string; upload: { url: string } };
  expect(storage.send(upload.url, body, contentType)).toBe(200);
  return key;
}

function entryBody(tenantId: string, over: Record<string, unknown> = {}) {
  return {
    tenantId,
    kind: 'top_up',
    amount: 500,
    amountConfirmation: 500,
    walletId,
    transactionId: fresh(),
    senderNumber: '01712345678',
    paidAt: new Date(Date.now() - 3_600_000).toISOString(),
    evidenceLine: 'bKash statement line 42',
    reason: 'The listener phone was off',
    ...over,
  };
}

interface Entry {
  id: string;
  planPaymentId: string;
  kind: string;
  amount: string;
  evidenceId: string | null;
  reversesEntryId: string | null;
  reversedBy: { id: string; reason: string } | null;
}

async function recorded(tenantId: string, over: Record<string, unknown> = {}): Promise<Entry> {
  const made = await operatorPost('/operator/manual-entries', entryBody(tenantId, over));
  expect(made.status, JSON.stringify(made.envelope)).toBe(201);
  return made.body as Entry;
}

function reverse(id: string, reason = 'Recorded against the wrong shop'): Promise<HttpResult> {
  return operatorPost(`/operator/manual-entries/${id}/reverse`, { reason });
}

async function planEntry(
  tenantId: string,
  plan: { planId: string; billingTermId: string },
  price: number,
  over: Record<string, unknown> = {},
): Promise<Entry> {
  return recorded(tenantId, {
    kind: 'plan',
    ...plan,
    amount: price,
    amountConfirmation: price,
    ...over,
  });
}

async function tenant(tenantId: string) {
  const { rows } = await admin.query<{
    state: string;
    plan_id: string | null;
    period_end: Date | null;
    balance_amount: string;
    balance_frozen: boolean;
  }>(
    'SELECT state, plan_id, period_end, balance_amount, balance_frozen FROM control.tenants WHERE id = $1',
    [tenantId],
  );
  const row = rows[0];
  if (!row) throw new Error('no such shop');
  return row;
}

async function payment(id: string) {
  const { rows } = await admin.query<{
    status: string;
    recorded_by_platform: boolean;
    transaction_id: string | null;
    evidence_id: string | null;
  }>(
    'SELECT status, recorded_by_platform, transaction_id, evidence_id FROM control.plan_payments WHERE id = $1',
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error('no such payment');
  return row;
}

interface Invoice {
  id: string;
  number: number;
  kind: string;
  amount: string;
  recordedByPlatform: boolean;
  reversesInvoiceId: string | null;
}

async function invoicesOf(client: ShopClient): Promise<Invoice[]> {
  return (await client.get('/billing/invoices')).body as Invoice[];
}

async function activity(tenantId: string, action: string) {
  const { rows } = await admin.query<{ actor_type: string; summary: Record<string, unknown> }>(
    'SELECT actor_type, summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
    [tenantId, action],
  );
  return rows;
}

async function notified(tenantId: string, fragment: string): Promise<number> {
  const { rows } = await admin.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM tenant.notifications WHERE tenant_id = $1 AND words::text LIKE $2`,
    [tenantId, `%${fragment}%`],
  );
  return rows[0]?.count ?? 0;
}

async function platformAudit(tenantId: string, action: string): Promise<number> {
  const { rows } = await admin.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM control.platform_audit_log WHERE target_id = $1 AND action = $2`,
    [tenantId, action],
  );
  return rows[0]?.count ?? 0;
}

/** Earlier cases' entries, moved off today, so a case that counts today's entries starts from none. */
async function clearToday(): Promise<void> {
  await admin.query(
    `UPDATE control.manual_payment_entries SET created_at = created_at - interval '3 days'
     WHERE created_at > now() - interval '2 days'`,
  );
}

describeIfDatabase('recording a payment (ADM-14)', () => {
  it('activates a plan through the same path as the queue, marked as recorded by the platform', async () => {
    const client = await shop();
    const plan = await seedPlan(1, '800.00');
    const key = await uploaded();
    const entry = await planEntry(client.tenantId, plan, 800, {
      evidenceKey: key,
      evidenceLine: undefined,
    });

    expect(entry.kind).toBe('purchase');
    const after = await tenant(client.tenantId);
    expect(after.state).toBe('active');
    expect(after.plan_id).toBe(plan.planId);
    expect(after.period_end?.getTime()).toBeGreaterThan(Date.now());

    const row = await payment(entry.planPaymentId);
    expect(row.status).toBe('verified');
    expect(row.recorded_by_platform).toBe(true);
    const used = await admin.query(
      'SELECT 1 FROM control.used_transaction_ids WHERE transaction_id = $1',
      [row.transaction_id],
    );
    expect(used.rowCount).toBe(1);

    const invoices = await invoicesOf(client);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      kind: 'purchase',
      amount: '800.00',
      recordedByPlatform: true,
    });

    const billing = (await client.get('/billing/payments')).body as {
      payments: { id: string; recordedByPlatform: boolean; state: string }[];
    };
    expect(billing.payments.find((p) => p.id === entry.planPaymentId)).toMatchObject({
      recordedByPlatform: true,
      state: 'paid',
    });

    const logged = await activity(client.tenantId, 'manual_payment_recorded');
    expect(logged).toHaveLength(1);
    expect(logged[0]?.actor_type).toBe('platform_support');
    expect(await notified(client.tenantId, 'Your payment has been recorded')).toBe(1);
    expect(await platformAudit(client.tenantId, 'manual_entry_recorded')).toBe(1);

    // D8-47: the file moved to the private bucket and left the temporary one.
    expect(storage.uploads.has(key)).toBe(false);
    expect(entry.evidenceId).not.toBeNull();
    const link = await getJson(port, `/operator/manual-entries/${entry.id}/evidence`, operator);
    expect(link.status).toBe(200);
    expect((link.body as { url: string }).url).toMatch(/^memory:\/\/evidence\//);
  });

  it('credits a top-up with what arrived, below the seller minimum too, and issues no invoice', async () => {
    const client = await shop();
    const entry = await recorded(client.tenantId, { amount: 50, amountConfirmation: 50 });
    expect(entry.kind).toBe('top_up');
    expect((await tenant(client.tenantId)).balance_amount).toBe('50.00');
    expect(await invoicesOf(client)).toHaveLength(0);
  });

  it("records an upgrade at the server's price and restarts the period", async () => {
    const client = await shop();
    const basic = await seedPlan(1, '500.00', 2000);
    await planEntry(client.tenantId, basic, 500);
    const higher = await seedPlan(1, '1500.00', 3000);
    const preview = await operatorPost('/operator/manual-entries/preview', {
      tenantId: client.tenantId,
      kind: 'upgrade',
      ...higher,
    });
    expect(preview.status, JSON.stringify(preview.envelope)).toBe(201);
    const priced = preview.body as { kind: string; amount: string; creditAmount: string };
    expect(priced.kind).toBe('upgrade');
    expect(Number(priced.creditAmount)).toBeGreaterThan(0);

    const entry = await recorded(client.tenantId, {
      kind: 'upgrade',
      ...higher,
      amount: Number(priced.amount),
      amountConfirmation: Number(priced.amount),
    });
    expect(entry.kind).toBe('upgrade');
    expect((await tenant(client.tenantId)).plan_id).toBe(higher.planId);
  });

  it('carries add-ons set to renew, in the amount shown, and a reversal ends them', async () => {
    const client = await shop();
    const plan = await seedPlan(1, '600.00');
    await planEntry(client.tenantId, plan, 600);
    const key = `man_addon_${fresh().toLowerCase()}`;
    const addon = await admin.query<{ id: string }>(
      `INSERT INTO control.addons (key, kind, limit_key, unit_size, price, label_en, label_bn)
       VALUES ($1, 'limit', 'paired_devices', 1, 39, 'Extra device', 'এক্সট্রা ডিভাইস') RETURNING id`,
      [key],
    );
    await admin.query(
      `INSERT INTO control.addon_purchases
         (tenant_id, addon_id, kind, limit_key, unit_size, quantity, price, status, paid_from, starts_at, expires_at)
       SELECT $1, $2, 'limit', 'paired_devices', 1, 1, 39, 'active', 'balance', now(),
              date_trunc('milliseconds', period_end) FROM control.tenants WHERE id = $1`,
      [client.tenantId, addon.rows[0]?.id],
    );
    const previewed = await operatorPost('/operator/manual-entries/preview', {
      tenantId: client.tenantId,
      kind: 'plan',
      ...plan,
    });
    const offer = previewed.body as { kind: string; amount: string; addons: { key: string }[] };
    expect(offer.kind).toBe('renewal');
    expect(offer.addons.map((a) => a.key)).toEqual([key]);
    expect(offer.amount).toBe('639.00');

    const entry = await planEntry(client.tenantId, plan, 639);
    const active = async (): Promise<number> =>
      (
        await admin.query(
          `SELECT 1 FROM control.addon_purchases WHERE plan_payment_id = $1 AND status = 'active'`,
          [entry.planPaymentId],
        )
      ).rowCount ?? 0;
    expect(await active()).toBe(1);
    expect((await reverse(entry.id)).status).toBe(201);
    expect(await active()).toBe(0);
  });
});

describeIfDatabase('the guards on an entry (ADM-15)', () => {
  it('refuses a transaction ID already used, a plan at the wrong amount, and a time in the future', async () => {
    const client = await shop();
    const first = await recorded(client.tenantId);
    const { transaction_id: used } = await payment(first.planPaymentId);
    const again = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, { transactionId: used }),
    );
    expect(again.status).toBe(409);

    const plan = await seedPlan(1, '800.00');
    const wrong = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, {
        kind: 'plan',
        ...plan,
        amount: 750,
        amountConfirmation: 750,
      }),
    );
    expect(wrong.status).toBe(409);
    expect(JSON.stringify(wrong.envelope)).toContain('800.00');

    const future = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, { paidAt: new Date(Date.now() + 86_400_000).toISOString() }),
    );
    expect(future.status).toBe(400);
    expect((await tenant(client.tenantId)).state).toBe('trial');
  });

  it('refuses an entry with no evidence, a reason or a wallet', async () => {
    const client = await shop();
    const bare = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, { evidenceLine: undefined }),
    );
    expect(bare.status).toBe(400);
    const noReason = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, { reason: ' ' }),
    );
    expect(noReason.status).toBe(400);
    const noWallet = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, { walletId: randomUUID() }),
    );
    expect(noWallet.status).toBe(404);
    expect((await tenant(client.tenantId)).balance_amount).toBe('0.00');
  });

  it('asks for the amount again above 10,000 TK, and exactly at it does not', async () => {
    await clearToday();
    const client = await shop();
    const large = entryBody(client.tenantId, { amount: 10_000.5, amountConfirmation: undefined });
    expect((await operatorPost('/operator/manual-entries', large)).status).toBe(400);
    const mistyped = { ...large, amountConfirmation: 10_000 };
    expect((await operatorPost('/operator/manual-entries', mistyped)).status).toBe(400);
    const typed = await operatorPost('/operator/manual-entries', {
      ...large,
      amountConfirmation: 10_000.5,
    });
    expect(typed.status, JSON.stringify(typed.envelope)).toBe(201);
    const exact = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, { amount: 10_000, amountConfirmation: undefined }),
    );
    expect(exact.status, JSON.stringify(exact.envelope)).toBe(201);
  });

  it('asks for the amount again past 10 entries in a day, and a reversal is not an entry', async () => {
    await clearToday();
    const client = await shop();
    const needsConfirmation = async (): Promise<boolean> =>
      (
        (
          await operatorPost('/operator/manual-entries/preview', {
            tenantId: client.tenantId,
            kind: 'top_up',
            amount: 100,
          })
        ).body as { needsConfirmation: boolean }
      ).needsConfirmation;
    let last: Entry | null = null;
    for (let made = 0; made < 9; made += 1) {
      last = await recorded(client.tenantId, { amount: 100, amountConfirmation: undefined });
    }
    if (!last) throw new Error('nothing recorded');
    // Nine entries and a reversal is still nine entries.
    expect((await reverse(last.id)).status).toBe(201);
    expect(await needsConfirmation()).toBe(false);
    await recorded(client.tenantId, { amount: 100, amountConfirmation: undefined });
    expect(await needsConfirmation()).toBe(true);
    const eleventh = entryBody(client.tenantId, { amount: 100, amountConfirmation: undefined });
    expect((await operatorPost('/operator/manual-entries', eleventh)).status).toBe(400);
    const typed = await operatorPost('/operator/manual-entries', {
      ...eleventh,
      amountConfirmation: 100,
    });
    expect(typed.status).toBe(201);
  });

  it('refuses an ID a shopper payment used, though no plan payment holds it', async () => {
    const client = await shop();
    const transactionId = fresh();
    await admin.query(
      'INSERT INTO control.used_transaction_ids (transaction_id, tenant_id) VALUES ($1, $2)',
      [transactionId, client.tenantId],
    );
    const refused = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, { transactionId }),
    );
    expect(refused.status).toBe(409);
    expect((await tenant(client.tenantId)).balance_amount).toBe('0.00');
  });

  it("refuses a top-up on a lapsed shop's frozen balance, and any entry for a deleted shop", async () => {
    const lapsed = await shop();
    await admin.query(`UPDATE control.tenants SET state = 'locked' WHERE id = $1`, [
      lapsed.tenantId,
    ]);
    const refused = await operatorPost('/operator/manual-entries', entryBody(lapsed.tenantId));
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect((await tenant(lapsed.tenantId)).balance_amount).toBe('0.00');

    const gone = await shop();
    const entry = await recorded(gone.tenantId);
    await admin.query(`UPDATE control.tenants SET state = 'deleted' WHERE id = $1`, [
      gone.tenantId,
    ]);
    expect((await operatorPost('/operator/manual-entries', entryBody(gone.tenantId))).status).toBe(
      409,
    );
    expect((await reverse(entry.id)).status).toBe(409);
  });

  it('keeps entries append-only for the app role', async () => {
    const client = await shop();
    const entry = await recorded(client.tenantId);
    await expect(
      appRole.query(`UPDATE control.manual_payment_entries SET reason = 'x' WHERE id = $1`, [
        entry.id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      appRole.query('DELETE FROM control.manual_payment_entries WHERE id = $1', [entry.id]),
    ).rejects.toThrow(/permission denied/);
  });

  it('is for operators only', async () => {
    const client = await shop();
    const body = entryBody(client.tenantId);
    expect((await postJson(port, '/operator/manual-entries', body)).status).toBe(401);
    expect((await client.post('/operator/manual-entries', body)).status).toBe(401);
    expect((await getJson(port, '/operator/manual-entries')).status).toBe(401);
    expect((await tenant(client.tenantId)).balance_amount).toBe('0.00');
  });
});

describeIfDatabase('reversing an entry (ADM-15)', () => {
  it('puts the shop back, takes back the invoice with a credit note, and keeps the original', async () => {
    const client = await shop();
    const before = await tenant(client.tenantId);
    const plan = await seedPlan(1, '900.00');
    const entry = await planEntry(client.tenantId, plan, 900);
    expect((await tenant(client.tenantId)).state).toBe('active');
    const [original] = await invoicesOf(client);

    const reversed = await reverse(entry.id, 'The payment was a fake');
    expect(reversed.status, JSON.stringify(reversed.envelope)).toBe(201);
    expect((reversed.body as Entry).reversesEntryId).toBe(entry.id);

    const after = await tenant(client.tenantId);
    expect(after.state).toBe(before.state);
    expect(after.plan_id).toBe(before.plan_id);
    expect(after.period_end?.getTime()).toBe(before.period_end?.getTime());
    expect((await payment(entry.planPaymentId)).status).toBe('reversed');

    const invoices = await invoicesOf(client);
    expect(invoices).toHaveLength(2);
    const note = invoices.find((invoice) => invoice.kind === 'credit_note');
    expect(note).toMatchObject({ amount: '-900.00', reversesInvoiceId: original?.id });
    expect(invoices.find((i) => i.id === original?.id)?.amount).toBe('900.00');

    const billing = (await client.get('/billing/payments?state=reversed')).body as {
      payments: { id: string; note: string | null }[];
    };
    expect(billing.payments.map((p) => p.id)).toEqual([entry.planPaymentId]);
    expect(billing.payments[0]?.note).toBe('The payment was a fake');

    const listed = await getJson(
      port,
      `/operator/manual-entries?tenantId=${client.tenantId}`,
      operator,
    );
    const rows = (listed.body as { entries: Entry[]; total: number }).entries;
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === entry.id)?.reversedBy?.reason).toBe(
      'The payment was a fake',
    );

    expect(await activity(client.tenantId, 'manual_payment_reversed')).toHaveLength(1);
    expect(await notified(client.tenantId, 'A payment was reversed')).toBe(1);
    expect(await platformAudit(client.tenantId, 'manual_entry_reversed')).toBe(1);

    expect((await reverse(entry.id)).status).toBe(409);
    expect((await reverse((reversed.body as Entry).id)).status).toBe(409);
  });

  it('brings back a scheduled downgrade the entry cancelled, and a frozen balance', async () => {
    const client = await shop();
    const low = await seedPlan(1, '200.00', 1100);
    const own = await seedPlan(1, '700.00', 1200);
    await planEntry(client.tenantId, own, 700);
    const effective = new Date(Date.now() + 10 * 86_400_000);
    await admin.query(
      `INSERT INTO control.scheduled_plan_changes (tenant_id, kind, target_plan_id, effective_at)
       VALUES ($1, 'downgrade', $2, $3)`,
      [client.tenantId, low.planId, effective],
    );
    await admin.query('UPDATE control.tenants SET balance_frozen = true WHERE id = $1', [
      client.tenantId,
    ]);
    const entry = await planEntry(client.tenantId, own, 700);
    expect(
      (
        await admin.query('SELECT 1 FROM control.scheduled_plan_changes WHERE tenant_id = $1', [
          client.tenantId,
        ])
      ).rowCount,
    ).toBe(0);
    expect((await tenant(client.tenantId)).balance_frozen).toBe(false);

    expect((await reverse(entry.id)).status).toBe(201);
    const back = await admin.query<{ target_plan_id: string; effective_at: Date }>(
      'SELECT target_plan_id, effective_at FROM control.scheduled_plan_changes WHERE tenant_id = $1',
      [client.tenantId],
    );
    expect(back.rows[0]?.target_plan_id).toBe(low.planId);
    expect(back.rows[0]?.effective_at.getTime()).toBe(effective.getTime());
    expect((await tenant(client.tenantId)).balance_frozen).toBe(true);
  });

  it('is refused once the shop has moved on, and the earlier plan is not wiped out', async () => {
    const client = await shop();
    const plan = await seedPlan(1, '400.00');
    const first = await planEntry(client.tenantId, plan, 400);
    const second = await planEntry(client.tenantId, plan, 400);
    const held = await tenant(client.tenantId);

    const refused = await reverse(first.id);
    expect(refused.status).toBe(409);
    const same = await tenant(client.tenantId);
    expect(same.period_end?.getTime()).toBe(held.period_end?.getTime());
    expect((await payment(first.planPaymentId)).status).toBe('verified');

    expect((await reverse(second.id)).status).toBe(201);
    expect((await reverse(first.id)).status).toBe(201);
    expect((await tenant(client.tenantId)).state).toBe('trial');
  });

  it('takes a top-up back in full, below zero and from a frozen balance', async () => {
    const client = await shop();
    const entry = await recorded(client.tenantId, { amount: 5000, amountConfirmation: 5000 });
    await admin.query(
      `INSERT INTO tenant.balance_ledger (tenant_id, type, amount) VALUES ($1, 'sms', '-3000.00')`,
      [client.tenantId],
    );
    expect((await tenant(client.tenantId)).balance_amount).toBe('2000.00');
    await admin.query('UPDATE control.tenants SET balance_frozen = true WHERE id = $1', [
      client.tenantId,
    ]);
    expect((await reverse(entry.id)).status).toBe(201);
    const after = await tenant(client.tenantId);
    expect(after.balance_amount).toBe('-3000.00');
    expect(after.balance_frozen).toBe(true);
    const { rows } = await admin.query<{ type: string; amount: string }>(
      `SELECT type, amount FROM tenant.balance_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [client.tenantId],
    );
    expect(rows[0]).toMatchObject({ type: 'adjustment', amount: '-5000.00' });
    // Taken back once only.
    expect((await reverse(entry.id)).status).toBe(409);
    expect((await tenant(client.tenantId)).balance_amount).toBe('-3000.00');
  });

  it('lets another manual entry use a reversed ID, but never a seller', async () => {
    const wrong = await shop();
    const right = await shop();
    const transactionId = fresh();
    const entry = await recorded(wrong.tenantId, { transactionId });
    expect((await reverse(entry.id)).status).toBe(201);

    const quoted = await right.post('/balance/top-up/quote', { amount: 500 });
    expect(quoted.status, JSON.stringify(quoted.envelope)).toBe(201);
    const seller = await right.post('/balance/top-up/confirm', {
      paymentId: (quoted.body as { id: string }).id,
      transactionId,
      senderNumber: '01712345678',
      amountPaid: 500,
    });
    expect(seller.status).toBe(409);

    await recorded(right.tenantId, { transactionId });
    expect((await tenant(right.tenantId)).balance_amount).toBe('500.00');
    const twice = await operatorPost(
      '/operator/manual-entries',
      entryBody(wrong.tenantId, { transactionId }),
    );
    expect(twice.status).toBe(409);
    const registered = await admin.query(
      'SELECT 1 FROM control.used_transaction_ids WHERE transaction_id = $1',
      [transactionId],
    );
    expect(registered.rowCount).toBe(1);
  });

  it("doesn't count a reversed plan's invoice as time an upgrade credits", async () => {
    const client = await shop();
    const basic = await seedPlan(1, '500.00', 4000);
    const first = await planEntry(client.tenantId, basic, 500);
    const higher = await seedPlan(1, '1500.00', 5000);
    const withCredit = await operatorPost('/operator/manual-entries/preview', {
      tenantId: client.tenantId,
      kind: 'upgrade',
      ...higher,
    });
    expect(Number((withCredit.body as { creditAmount: string }).creditAmount)).toBeGreaterThan(0);

    // A later, reversed entry on top: the credit is what the first plan left, as it was before.
    const second = await planEntry(client.tenantId, basic, 500);
    expect((await reverse(second.id)).status).toBe(201);
    const after = await operatorPost('/operator/manual-entries/preview', {
      tenantId: client.tenantId,
      kind: 'upgrade',
      ...higher,
    });
    expect((after.body as { creditAmount: string }).creditAmount).toBe(
      (withCredit.body as { creditAmount: string }).creditAmount,
    );
    expect(first.kind).toBe('purchase');
  });
});

describeIfDatabase('the list of entries (D8-55)', () => {
  it('filters by shop, operator and day, newest first, a page at a time', async () => {
    const one = await shop();
    const two = await shop();
    const a = await recorded(one.tenantId);
    const b = await recorded(one.tenantId);
    await recorded(two.tenantId);
    const read = async (query: string) =>
      (await getJson(port, `/operator/manual-entries?${query}`, operator)).body as {
        entries: Entry[];
        total: number;
      };
    const ofOne = await read(`tenantId=${one.tenantId}`);
    expect(ofOne.total).toBe(2);
    expect(ofOne.entries.map((row) => row.id)).toEqual([b.id, a.id]);
    const paged = await read(`tenantId=${one.tenantId}&limit=1&page=2`);
    expect(paged.entries.map((row) => row.id)).toEqual([a.id]);
    expect(paged.total).toBe(2);
    const someoneElse = await read(`tenantId=${one.tenantId}&operatorId=${randomUUID()}`);
    expect(someoneElse.total).toBe(0);
    const mine = await read(`tenantId=${one.tenantId}&operatorId=${operatorId}`);
    expect(mine.total).toBe(2);
    const longAgo = await read(`tenantId=${one.tenantId}&dateFrom=2020-01-01&dateTo=2020-01-02`);
    expect(longAgo.total).toBe(0);

    await admin.query(
      `UPDATE control.manual_payment_entries SET created_at = '2024-05-10T12:00:00+06:00' WHERE id = $1`,
      [a.id],
    );
    const fromNextDay = await read(`tenantId=${one.tenantId}&dateFrom=2024-05-11`);
    expect(fromNextDay.entries.map((row) => row.id)).toEqual([b.id]);
    const thatDay = await read(`tenantId=${one.tenantId}&dateFrom=2024-05-10&dateTo=2024-05-10`);
    expect(thatDay.entries.map((row) => row.id)).toEqual([a.id]);
  });
});

describeIfDatabase("a seller's screenshot (ADM-17, D8-15)", () => {
  async function quoted(client: ShopClient): Promise<string> {
    const made = await client.post('/balance/top-up/quote', { amount: 500 });
    expect(made.status, JSON.stringify(made.envelope)).toBe(201);
    return (made.body as { id: string }).id;
  }

  async function sellerUpload(client: ShopClient, body: Buffer = JPEG): Promise<string> {
    const started = await client.post('/balance/top-up/evidence', {
      contentType: 'image/jpeg',
      bytes: body.length,
    });
    expect(started.status, JSON.stringify(started.envelope)).toBe(201);
    const { key, upload } = started.body as { key: string; upload: { url: string } };
    expect(storage.send(upload.url, body, 'image/jpeg')).toBe(200);
    return key;
  }

  const confirm = (client: ShopClient, paymentId: string, over: Record<string, unknown> = {}) =>
    client.post('/balance/top-up/confirm', {
      paymentId,
      transactionId: fresh(),
      senderNumber: '01712345678',
      amountPaid: 500,
      ...over,
    });

  it('waits in the queue with its screenshot, and credits nothing by itself', async () => {
    const client = await shop();
    const paymentId = await quoted(client);
    const key = await sellerUpload(client);
    const sent = await confirm(client, paymentId, { evidenceKey: key });
    expect(sent.status, JSON.stringify(sent.envelope)).toBe(201);
    expect((await tenant(client.tenantId)).balance_amount).toBe('0.00');
    expect((await payment(paymentId)).evidence_id).not.toBeNull();
    expect(storage.uploads.has(key)).toBe(false);

    const queue = (await getJson(port, '/operator/payment-queue', operator)).body as {
      id: string;
      evidenceId: string | null;
    }[];
    expect(queue.find((row) => row.id === paymentId)?.evidenceId).not.toBeNull();
    const link = await getJson(port, `/operator/payment-queue/${paymentId}/evidence`, operator);
    expect(link.status).toBe(200);
    // The seller can't read it back, whatever they send.
    expect((await client.get(`/operator/payment-queue/${paymentId}/evidence`)).status).toBe(401);
  });

  it('is optional', async () => {
    const client = await shop();
    const paymentId = await quoted(client);
    expect((await confirm(client, paymentId)).status).toBe(201);
    expect((await payment(paymentId)).evidence_id).toBeNull();
    expect(
      (await getJson(port, `/operator/payment-queue/${paymentId}/evidence`, operator)).status,
    ).toBe(404);
  });

  it("refuses another shop's upload and a file that is not an image, keeping nothing", async () => {
    const owner = await shop();
    const other = await shop();
    const paymentId = await quoted(other);
    const key = await sellerUpload(owner);
    const stored = storage.evidence.size;
    expect((await confirm(other, paymentId, { evidenceKey: key })).status).toBe(400);
    expect(storage.evidence.size).toBe(stored);

    const fake = await sellerUpload(other, Buffer.from('<html>not a picture</html>'));
    expect((await confirm(other, paymentId, { evidenceKey: fake })).status).toBe(400);
    expect(storage.evidence.size).toBe(stored);
    expect((await payment(paymentId)).transaction_id).toBeNull();
  });

  it('keeps the upload, and nothing else, when the submission is refused', async () => {
    const client = await shop();
    const first = await quoted(client);
    const transactionId = fresh();
    expect((await confirm(client, first, { transactionId })).status).toBe(201);
    const other = await shop();
    const second = await quoted(other);
    const key = await sellerUpload(other);
    const stored = storage.evidence.size;
    const refused = await confirm(other, second, { transactionId, evidenceKey: key });
    expect(refused.status).toBe(409);
    expect(storage.evidence.size).toBe(stored);
    expect(storage.uploads.has(key)).toBe(true);
    // Fixed and sent again, the same file is accepted.
    expect((await confirm(other, second, { evidenceKey: key })).status).toBe(201);
    expect(storage.evidence.size).toBe(stored + 1);
  });

  it('answers that the store is away, and nothing is lost', async () => {
    const client = await shop();
    const paymentId = await quoted(client);
    const key = await sellerUpload(client);
    storage.down = true;
    try {
      expect((await confirm(client, paymentId, { evidenceKey: key })).status).toBe(503);
    } finally {
      storage.down = false;
    }
    expect((await payment(paymentId)).transaction_id).toBeNull();
    expect((await confirm(client, paymentId, { evidenceKey: key })).status).toBe(201);
  });
});

describeIfDatabase('removing screenshots after two years (D8-47)', () => {
  it('removes old files and says so, and leaves newer ones', async () => {
    const client = await shop();
    const key = await uploaded();
    const old = await recorded(client.tenantId, { evidenceKey: key, evidenceLine: undefined });
    const newKey = await uploaded();
    const young = await recorded(client.tenantId, { evidenceKey: newKey, evidenceLine: undefined });
    await admin.query(
      `UPDATE control.payment_evidence SET created_at = now() - interval '25 months' WHERE id = $1`,
      [old.evidenceId],
    );
    const objectOf = async (id: string | null): Promise<string> =>
      (
        await admin.query<{ object_key: string }>(
          'SELECT object_key FROM control.payment_evidence WHERE id = $1',
          [id],
        )
      ).rows[0]?.object_key ?? '';
    const oldObject = await objectOf(old.evidenceId);
    const youngObject = await objectOf(young.evidenceId);
    expect(storage.evidence.has(oldObject)).toBe(true);

    await app.get(PaymentEvidence, { strict: false }).sweep();

    expect(storage.evidence.has(oldObject)).toBe(false);
    expect(storage.evidence.has(youngObject)).toBe(true);
    const gone = await getJson(port, `/operator/manual-entries/${old.id}/evidence`, operator);
    expect(gone.status).toBe(409);
    expect(
      (await getJson(port, `/operator/manual-entries/${young.id}/evidence`, operator)).status,
    ).toBe(200);
    // The entry itself stays.
    const listed = (
      await getJson(port, `/operator/manual-entries?tenantId=${client.tenantId}`, operator)
    ).body as { total: number };
    expect(listed.total).toBe(2);
  });
});

describeIfDatabase('the revenue report (D8-10)', () => {
  it('shows manual entries apart, each on the day done, and counts plans as earned', async () => {
    const client = await shop();
    const plan = await seedPlan(1, '300.00');
    const entry = await planEntry(client.tenantId, plan, 300);
    const topUp = await recorded(client.tenantId, { amount: 700, amountConfirmation: 700 });
    await admin.query(
      `UPDATE control.manual_payment_entries SET created_at = '2024-02-14T12:00:00+06:00' WHERE id IN ($1, $2)`,
      [entry.id, topUp.id],
    );
    await admin.query(
      `UPDATE control.plan_payments SET verified_at = '2024-02-14T12:00:00+06:00' WHERE id = $1`,
      [entry.planPaymentId],
    );
    const read = async () =>
      (
        await getJson(
          port,
          '/operator/reports/revenue?dateFrom=2024-02-14&dateTo=2024-02-14',
          operator,
        )
      ).body as {
        total: {
          wallet: Record<string, string>;
          manual: Record<string, string>;
          earned: string;
        };
      };
    const report = await read();
    expect(report.total.wallet['purchase']).toBe('0.00');
    expect(report.total.manual).toEqual({
      plans: '300.00',
      plansReversed: '0.00',
      topUps: '700.00',
      topUpsReversed: '0.00',
    });
    expect(report.total.earned).toBe('300.00');

    expect((await reverse(entry.id)).status).toBe(201);
    const { rows } = await admin.query<{ id: string }>(
      'SELECT id FROM control.manual_payment_entries WHERE reverses_entry_id = $1',
      [entry.id],
    );
    await admin.query(
      `UPDATE control.manual_payment_entries SET created_at = '2024-02-14T18:00:00+06:00' WHERE id = $1`,
      [rows[0]?.id],
    );
    const undone = await read();
    expect(undone.total.manual['plansReversed']).toBe('300.00');
    expect(undone.total.earned).toBe('0.00');
  });
});

// Phase 8 Slice 8.8 (D8-75, the owner's answer to the sketch, 2026-11-10): a transfer to one of Lytro's bank accounts, recorded by
// hand with the transfer's reference where a TrxID would be and no sender.
describeIfDatabase("A manual entry paid to Lytro's bank account (D8-75)", () => {
  async function bankAccount(): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO control.platform_bank_accounts (bank_name, account_name, account_number, branch)
       VALUES ('BRAC Bank', 'Lytronix Ltd', $1, 'Gulshan') RETURNING id`,
      [`1501${fresh().replace(/[A-Z]/g, '7')}`],
    );
    return rows[0]?.id ?? '';
  }

  const reference = (): string => `brac-ft-${fresh().replace(/[A-Z]/g, '5')}`;

  function bankBody(tenantId: string, bankAccountId: string, over: Record<string, unknown> = {}) {
    // No number and no sender: a bank transfer has neither.
    const body: Record<string, unknown> = {
      ...entryBody(tenantId),
      bankAccountId,
      transactionId: reference(),
    };
    delete body['walletId'];
    delete body['senderNumber'];
    return { ...body, ...over };
  }

  it('records it as the queue would, the reference kept in capitals, with no sender, and the list names the account', async () => {
    const client = await shop();
    const account = await bankAccount();
    const plan = await seedPlan(6, '3984.00');
    const ref = reference();
    const made = await operatorPost(
      '/operator/manual-entries',
      bankBody(client.tenantId, account, {
        kind: 'plan',
        ...plan,
        amount: 3984,
        amountConfirmation: 3984,
        transactionId: ref,
      }),
    );
    expect(made.status, JSON.stringify(made.envelope)).toBe(201);
    expect(made.body).toMatchObject({
      bankAccountId: account,
      walletId: null,
      senderNumber: null,
      transactionId: ref.toUpperCase(),
    });
    const entry = made.body as Entry;
    expect(await payment(entry.planPaymentId)).toMatchObject({
      status: 'verified',
      recorded_by_platform: true,
      transaction_id: ref.toUpperCase(),
    });
    expect((await tenant(client.tenantId)).plan_id).toBe(plan.planId);
    const listed = await getJson(
      port,
      `/operator/manual-entries?tenantId=${client.tenantId}`,
      operator,
    );
    expect((listed.body as { entries: Entry[] }).entries).toEqual([
      expect.objectContaining({ id: entry.id, bankAccountId: account, walletId: null }),
    ]);
  });

  it('uses a reference once platform-wide, as a TrxID, and frees it when its entry is reversed (D8-56)', async () => {
    const client = await shop();
    const account = await bankAccount();
    const ref = reference();
    const first = await operatorPost(
      '/operator/manual-entries',
      bankBody(client.tenantId, account, { transactionId: ref }),
    );
    expect(first.status, JSON.stringify(first.envelope)).toBe(201);
    const again = await operatorPost(
      '/operator/manual-entries',
      bankBody(client.tenantId, account, { transactionId: ref.toUpperCase() }),
    );
    expect(again.status).toBe(409);
    expect(fieldsOf(again)).toEqual({ transactionId: 'already_used' });

    expect((await reverse((first.body as Entry).id)).status).toBe(201);
    const afterReversal = await operatorPost(
      '/operator/manual-entries',
      bankBody(client.tenantId, account, { transactionId: ref }),
    );
    expect(afterReversal.status, JSON.stringify(afterReversal.envelope)).toBe(201);
  });

  it("refuses an account that isn't Lytro's, a sender, both a number and an account, and a TrxID-only reference rule", async () => {
    const client = await shop();
    const account = await bankAccount();
    const unknown = await operatorPost(
      '/operator/manual-entries',
      bankBody(client.tenantId, randomUUID()),
    );
    expect(unknown.status).toBe(404);
    expect(errorOf(unknown).message).toMatch(/isn't one of Lytro's|Lytro-র নয়/);

    const withSender = await operatorPost(
      '/operator/manual-entries',
      bankBody(client.tenantId, account, { senderNumber: '01712345678' }),
    );
    expect(withSender.status).toBe(400);
    expect(fieldsOf(withSender)).toEqual({ senderNumber: 'not_allowed' });

    const both = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, { bankAccountId: account }),
    );
    expect(both.status).toBe(400);
    expect(fieldsOf(both)).toEqual({ bankAccountId: 'not_allowed' });

    // A wallet's TrxID stays letters and digits only.
    const dashed = await operatorPost(
      '/operator/manual-entries',
      entryBody(client.tenantId, { transactionId: 'BRAC-FT-55190327' }),
    );
    expect(dashed.status).toBe(400);
    expect(fieldsOf(dashed)).toEqual({ transactionId: 'invalid_format' });
  });

  it('keeps an account a payment was recorded to from being removed; an unused one goes', async () => {
    const client = await shop();
    const used = await bankAccount();
    expect(
      (await operatorPost('/operator/manual-entries', bankBody(client.tenantId, used))).status,
    ).toBe(201);
    const refused = await deleteJson(
      port,
      `/operator/payment-methods/bank-accounts/${used}`,
      operator,
    );
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toMatch(/Turn it off instead|বন্ধ করে দিন/);
    const kept = await admin.query('SELECT id FROM control.platform_bank_accounts WHERE id = $1', [
      used,
    ]);
    expect(kept.rowCount).toBe(1);

    const unused = await bankAccount();
    const removed = await deleteJson(
      port,
      `/operator/payment-methods/bank-accounts/${unused}`,
      operator,
    );
    expect(removed.status, JSON.stringify(removed.envelope)).toBeLessThan(300);
  });
  it('keeps a number a payment was recorded to from being removed, as a bank account (ADM-14)', async () => {
    const client = await shop();
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO control.platform_wallets (provider, number) VALUES ('nagad', '01800000009') RETURNING id`,
    );
    const number = rows[0]?.id ?? '';
    await recorded(client.tenantId, { walletId: number });
    const refused = await deleteJson(port, `/operator/platform-wallets/${number}`, operator);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toMatch(/Turn it off instead|বন্ধ করে দিন/);
    const kept = await admin.query('SELECT id FROM control.platform_wallets WHERE id = $1', [
      number,
    ]);
    expect(kept.rowCount).toBe(1);
  });
});

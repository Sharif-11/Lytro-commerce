import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ReconciliationDifferenceKind as Kind } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { DAY_MS, HOUR_MS, dhakaDate, dhakaDayStart } from '../src/common/time';
import { Reconciliation } from '../src/modules/reconciliation/services/reconciliation';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { OperatorAlerts } from '../src/modules/shared/mail/services/operator-alerts';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { cookieFrom, getJson, postJson } from './support/http';
import { seedOrderFor } from './support/orders';
import { openShop } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// DAT-52, D9-16, OD-44 (Phase 9 Slice 9.5, the user 2026-11-13): yesterday's money compared at 06:00, each difference -- an
// amount off by a paisa, or something unmatched 24 hours on -- kept once and emailed, and resolved by the operator with a
// note. Runs only with DATABASE_TEST_ADMIN_URL.

const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_reconciliation_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const PASSWORD = 'reconcile-pass-1';
let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
let operatorEmail = '';
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'reconciliation-e2e-otp-secret-0123456789012';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  operatorEmail = email;
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
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

const now = new Date();
const yesterday = dhakaDate(new Date(dhakaDayStart(dhakaDate(now)).getTime() - DAY_MS));
// Noon on the day compared, and noon the day before it: what has had its 24 hours by 06:00 today.
const IN_YESTERDAY = new Date(dhakaDayStart(yesterday).getTime() + 12 * HOUR_MS);
const IN_SETTLED = new Date(IN_YESTERDAY.getTime() - DAY_MS);

const trx = (): string => `T${randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}`;

interface PaymentSeed {
  kind: 'top_up' | 'purchase';
  amount: string;
  status?: string;
  arrived?: string | null;
  transactionId?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
}

async function payment(tenantId: string, seed: PaymentSeed): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `INSERT INTO control.plan_payments
       (tenant_id, kind, amount, status, amount_arrived, transaction_id, verified_by, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      tenantId,
      seed.kind,
      seed.amount,
      seed.status ?? 'verified',
      seed.arrived ?? null,
      seed.transactionId === undefined ? trx() : seed.transactionId,
      seed.verifiedBy ?? null,
      seed.verifiedAt === undefined ? IN_YESTERDAY : seed.verifiedAt,
    ],
  );
  return rows[0]?.id ?? '';
}

async function ledger(
  tenantId: string,
  type: string,
  amount: string,
  reference: Record<string, unknown>,
  at: Date = IN_YESTERDAY,
): Promise<void> {
  await admin.query(
    `INSERT INTO tenant.balance_ledger (tenant_id, type, amount, reference, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, type, amount, JSON.stringify(reference), at],
  );
}

async function invoiceFor(
  tenantId: string,
  paymentId: string,
  amount: string,
  kind: 'purchase' | 'top_up' = 'purchase',
): Promise<void> {
  await admin.query(
    `INSERT INTO control.invoices (tenant_id, number, kind, amount, plan_payment_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, Math.floor(Math.random() * 1e12), kind, amount, paymentId],
  );
}

async function lytroSms(seed: {
  status: 'matched' | 'unmatched';
  amount: string;
  at: Date;
  paymentId?: string;
}): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `INSERT INTO control.lytro_listener_messages
       (device_id, sender, method, transaction_id, amount, status, plan_payment_id, received_at)
     VALUES ($1, 'bKash', 'bkash', $2, $3, $4, $5, $6) RETURNING id`,
    [randomUUID(), trx(), seed.amount, seed.status, seed.paymentId ?? null, seed.at],
  );
  return rows[0]?.id ?? '';
}

interface Found {
  id: string;
  kind: Kind;
  subject: string;
  expected: string | null;
  found: string | null;
  details: Record<string, unknown>;
}

async function differences(): Promise<Found[]> {
  const { rows } = await admin.query<Found>(
    `SELECT id, kind, subject, expected, found, details FROM control.reconciliation_differences WHERE day = $1`,
    [yesterday],
  );
  return rows;
}

function of(found: Found[], subject: string): Kind[] {
  return found.filter((row) => row.subject === subject).map((row) => row.kind);
}

describeIfDatabase('the daily reconciliation (DAT-52)', () => {
  const planted: Record<string, string> = {};
  let alerts: MockInstance;
  let found: Found[] = [];

  beforeAll(async () => {
    if (!ADMIN_URL) return;
    alerts = vi.spyOn(app.get(OperatorAlerts), 'alert').mockResolvedValue(1);
    const lytroShop = await openShop(port, texts, 'rec');
    const driftShop = await openShop(port, texts, 'rec');
    const ownShop = await openShop(port, texts, 'rec');
    const shopA = lytroShop.tenantId;
    await seedBalance(admin, shopA, '5000');

    // Lytro's own money: top-ups, plans paid from the balance, plans paid by a wallet.
    // Approved by an operator, so only the ledger is in question here.
    const byOperator = randomUUID();
    planted['topUpRight'] = await payment(shopA, {
      kind: 'top_up',
      amount: '500',
      verifiedBy: byOperator,
    });
    await ledger(shopA, 'top_up', '500', { planPaymentId: planted['topUpRight'] });
    await invoiceFor(shopA, planted['topUpRight'], '500', 'top_up');
    planted['topUpUncredited'] = await payment(shopA, {
      kind: 'top_up',
      amount: '400',
      verifiedBy: byOperator,
    });
    await invoiceFor(shopA, planted['topUpUncredited'], '400', 'top_up');
    planted['topUpWrongAmount'] = await payment(shopA, {
      kind: 'top_up',
      amount: '300',
      arrived: '300',
      verifiedBy: byOperator,
    });
    await ledger(shopA, 'top_up', '250', { planPaymentId: planted['topUpWrongAmount'] });
    await invoiceFor(shopA, planted['topUpWrongAmount'], '300', 'top_up');
    // D9-26 (Slice 9.8): a top-up has its own invoice, like a plan.
    planted['topUpNoInvoice'] = await payment(shopA, {
      kind: 'top_up',
      amount: '200',
      verifiedBy: byOperator,
    });
    await ledger(shopA, 'top_up', '200', { planPaymentId: planted['topUpNoInvoice'] });

    planted['fromBalanceRight'] = await payment(shopA, {
      kind: 'purchase',
      amount: '449',
      transactionId: null,
    });
    await ledger(shopA, 'plan_payment', '-449', { planPaymentId: planted['fromBalanceRight'] });
    await invoiceFor(shopA, planted['fromBalanceRight'], '449');
    planted['fromBalanceUncharged'] = await payment(shopA, {
      kind: 'purchase',
      amount: '699',
      transactionId: null,
    });
    await invoiceFor(shopA, planted['fromBalanceUncharged'], '699');

    planted['walletNoProof'] = await payment(shopA, { kind: 'purchase', amount: '999' });
    planted['walletWithSms'] = await payment(shopA, { kind: 'purchase', amount: '449' });
    await invoiceFor(shopA, planted['walletWithSms'], '449');
    await lytroSms({
      status: 'matched',
      amount: '449',
      at: IN_YESTERDAY,
      paymentId: planted['walletWithSms'],
    });

    // Money at Lytro's wallets: unclaimed after 24 hours, not yet 24 hours old, and matched to a payment still pending.
    planted['unclaimed'] = await lytroSms({ status: 'unmatched', amount: '700', at: IN_SETTLED });
    planted['unclaimedYoung'] = await lytroSms({
      status: 'unmatched',
      amount: '800',
      at: IN_YESTERDAY,
    });
    const pending = await payment(shopA, {
      kind: 'purchase',
      amount: '449',
      status: 'pending',
      verifiedAt: null,
    });
    planted['proofPending'] = await lytroSms({
      status: 'matched',
      amount: '449',
      at: IN_SETTLED,
      paymentId: pending,
    });
    const pendingGateway = await payment(shopA, {
      kind: 'purchase',
      amount: '699',
      status: 'pending',
      verifiedAt: null,
    });
    const { rows: answer } = await admin.query<{ id: string }>(
      `INSERT INTO control.gateway_answers (tenant_id, method, action, session_id, payment_id, answer, transaction_status, received_at)
       VALUES (NULL, 'bkash', 'query', $1, 'TRG1', '{}', 'Completed', $2) RETURNING id`,
      [pendingGateway, IN_SETTLED],
    );
    planted['answerPending'] = answer[0]?.id ?? '';

    // A shop whose balance no longer agrees with its ledger.
    await seedBalance(admin, driftShop.tenantId, '100');
    await admin.query('SET session_replication_role = replica');
    await admin.query(
      'UPDATE control.tenants SET balance_amount = balance_amount + 1 WHERE id = $1',
      [driftShop.tenantId],
    );
    await admin.query('SET session_replication_role = DEFAULT');
    planted['drift'] = driftShop.tenantId;

    // A shop's own day: an SMS the balance never paid, order fees right, wrong and twice, courier messages, payments.
    const shopC = ownShop.tenantId;
    planted['own'] = shopC;
    await seedBalance(admin, shopC, '5000');
    await admin.query(
      `INSERT INTO tenant.sms_log (tenant_id, kind, to_phone, units, cost, is_essential, status, created_at)
       VALUES ($1, 'shopper_code', '01700000000', 1, 2.00, false, 'sent', $2)`,
      [shopC, IN_YESTERDAY],
    );
    const fee = { orderTotal: '1000.00', minimum: '20.00', percent: '1.5' };
    const rightOrder = randomUUID();
    const wrongOrder = randomUUID();
    const twiceOrder = randomUUID();
    await ledger(shopC, 'order_fee', '-20.00', { orderId: rightOrder, ...fee });
    await ledger(shopC, 'order_fee', '-25.00', { orderId: wrongOrder, ...fee });
    await ledger(shopC, 'order_fee', '-20.00', { orderId: twiceOrder, ...fee });
    await ledger(shopC, 'order_fee', '-20.00', { orderId: twiceOrder, ...fee });
    planted['rightOrder'] = rightOrder;
    planted['twiceOrder'] = twiceOrder;
    const { rows: wrongFee } = await admin.query<{ id: string }>(
      `SELECT id::text FROM tenant.balance_ledger WHERE tenant_id = $1 AND reference->>'orderId' = $2`,
      [shopC, wrongOrder],
    );
    planted['wrongFee'] = wrongFee[0]?.id ?? '';

    const { rows: raw } = await admin.query<{ id: string; outcome: string }>(
      `INSERT INTO tenant.courier_raw_messages (tenant_id, courier_key, body, outcome, received_at)
       VALUES ($1, 'steadfast', '{"weird":true}', 'unread', $2), ($1, 'steadfast', '{}', 'read', $2)
       RETURNING id, outcome`,
      [shopC, IN_YESTERDAY],
    );
    planted['unreadMessage'] = raw.find((row) => row.outcome === 'unread')?.id ?? '';
    planted['readMessage'] = raw.find((row) => row.outcome === 'read')?.id ?? '';

    const session = async (decidedBy: string | null): Promise<string> => {
      const orderId = randomUUID();
      await seedOrderFor(admin, shopC, orderId, [randomUUID()]);
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO tenant.payment_sessions
           (tenant_id, ref, order_id, source, amount, expires_at, state, decided_by, updated_at)
         VALUES ($1, $2, $3, 'checkout', 450, now(), 'verified', $4, $5) RETURNING id`,
        [shopC, randomUUID().replace(/-/g, '').slice(0, 20), orderId, decidedBy, IN_YESTERDAY],
      );
      return rows[0]?.id ?? '';
    };
    planted['sessionNoProof'] = await session(null);
    planted['sessionByStaff'] = await session(randomUUID());

    const result = await app.get(Reconciliation).run(now);
    expect(result.day).toBe(yesterday);
    expect(result.failed).toBe(0);
    found = await differences();
  });

  it('reports a planted missing payment the next day: money at a Lytro wallet no payment claimed (DAT-52)', () => {
    expect(of(found, planted['unclaimed'] ?? '')).toEqual([Kind.WalletMoneyUnclaimed]);
    // Not yet 24 hours old: tomorrow's run looks at it.
    expect(of(found, planted['unclaimedYoung'] ?? '')).toEqual([]);
  });

  it('holds a verified top-up to exactly one credit of what arrived', () => {
    expect(of(found, planted['topUpRight'] ?? '')).toEqual([]);
    expect(of(found, planted['topUpUncredited'] ?? '')).toEqual([Kind.TopUpCreditMismatch]);
    const wrong = found.find((row) => row.subject === planted['topUpWrongAmount']);
    expect(wrong).toMatchObject({
      kind: Kind.TopUpCreditMismatch,
      expected: '300.00',
      found: '250.00',
    });
  });

  it('holds a verified top-up to exactly one invoice (D9-26)', () => {
    expect(of(found, planted['topUpNoInvoice'] ?? '')).toEqual([Kind.InvoiceMismatch]);
  });

  it('holds a plan paid from the balance to charges of its price', () => {
    expect(of(found, planted['fromBalanceRight'] ?? '')).toEqual([]);
    const uncharged = found.find((row) => row.subject === planted['fromBalanceUncharged']);
    expect(uncharged).toMatchObject({
      kind: Kind.BalancePaymentMismatch,
      expected: '699.00',
      found: '0.00',
    });
  });

  it('reports what Lytro verified with nothing behind it, and a payment with no invoice', () => {
    expect(of(found, planted['walletNoProof'] ?? '').sort()).toEqual(
      [Kind.InvoiceMismatch, Kind.PaymentWithoutProof].sort(),
    );
    expect(of(found, planted['walletWithSms'] ?? '')).toEqual([]);
  });

  it('reports money that arrived for a payment still not verified 24 hours on', () => {
    expect(of(found, planted['proofPending'] ?? '')).toEqual([Kind.ProofWithoutPayment]);
    expect(of(found, planted['answerPending'] ?? '')).toEqual([Kind.ProofWithoutPayment]);
  });

  it("reports a shop's balance that isn't the sum of its ledger", () => {
    expect(found.find((row) => row.subject === planted['drift'])).toMatchObject({
      kind: Kind.BalanceDrift,
      expected: '100.00',
      found: '101.00',
    });
  });

  it("reports a shop's day of SMS the balance never paid for", () => {
    expect(
      found.find((row) => row.subject === planted['own'] && row.kind === Kind.SmsChargeMismatch),
    ).toMatchObject({ expected: '2.00', found: '0.00' });
  });

  it('works each order fee out again from its own figures, and catches a fee taken twice', () => {
    expect(found.find((row) => row.subject === planted['wrongFee'])).toMatchObject({
      kind: Kind.OrderFeeMismatch,
      expected: '20.00',
      found: '25.00',
    });
    expect(of(found, `order:${planted['twiceOrder'] ?? ''}`)).toEqual([Kind.OrderFeeMismatch]);
    expect(found.filter((row) => row.details['orderId'] === planted['rightOrder'])).toEqual([]);
  });

  it("reports a courier's message that couldn't be read, and not one that was", () => {
    expect(of(found, planted['unreadMessage'] ?? '')).toEqual([Kind.CourierMessageUnread]);
    expect(of(found, planted['readMessage'] ?? '')).toEqual([]);
  });

  it("reports a shop's payment Lytro marked paid with nothing behind it; staff's own decision is theirs", () => {
    expect(of(found, planted['sessionNoProof'] ?? '')).toEqual([Kind.ShopPaymentWithoutProof]);
    expect(of(found, planted['sessionByStaff'] ?? '')).toEqual([]);
  });

  it('emails the operators once with the counts, and a second run of the day adds nothing', async () => {
    expect(alerts).toHaveBeenCalledTimes(1);
    const [subject, body] = alerts.mock.calls[0] as [string, string];
    expect(subject).toContain(yesterday);
    expect(body).toContain(`${Kind.WalletMoneyUnclaimed}: 1`);
    // Counts and kinds only: no shop, no amount.
    expect(body).not.toContain(planted['own']);
    expect(body).not.toContain('700');

    const again = await app.get(Reconciliation).run(now);
    expect(again).toMatchObject({ day: yesterday, added: 0, found: found.length });
    expect(alerts).toHaveBeenCalledTimes(1);
    expect(await differences()).toHaveLength(found.length);
    const runs = await admin.query('SELECT 1 FROM control.reconciliation_runs WHERE day = $1', [
      yesterday,
    ]);
    expect(runs.rowCount).toBe(1);
  });
});

describeIfDatabase("the operator's word on a difference (DAT-52, ADM-08)", () => {
  it('lists the open ones, resolves one with a note in the audit log, and refuses it twice', async () => {
    const listed = await getJson(port, '/operator/reconciliation/differences', operator);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const page = listed.body as {
      differences: {
        id: string;
        state: string;
        tenantId: string | null;
        shopName: string | null;
        shopSlug: string | null;
      }[];
      total: number;
      lastRun: { day: string; ranAt: string } | null;
    };
    expect(page.total).toBeGreaterThan(0);
    // Slice 9.9: each row names its shop, and the page says when the check last ran.
    expect(page.lastRun?.day).toBe(yesterday);
    expect(typeof page.lastRun?.ranAt).toBe('string');
    for (const row of page.differences) {
      if (row.tenantId) {
        expect(row.shopName, row.id).toEqual(expect.any(String));
        expect(row.shopSlug, row.id).toEqual(expect.any(String));
      } else {
        expect(row).toMatchObject({ shopName: null, shopSlug: null });
      }
    }
    const target = page.differences[0];
    if (!target) throw new Error('no difference to resolve');
    expect(target.state).toBe('open');

    const resolved = await postJson(
      port,
      `/operator/reconciliation/differences/${target.id}/resolve`,
      { note: 'Checked the wallet statement; the seller was told.' },
      operator,
    );
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);
    expect(resolved.body).toMatchObject({
      id: target.id,
      state: 'resolved',
      note: 'Checked the wallet statement; the seller was told.',
    });
    const audit = await admin.query(
      `SELECT 1 FROM control.platform_audit_log WHERE action = 'reconciliation_difference_resolved' AND target_id = $1`,
      [target.id],
    );
    expect(audit.rowCount).toBe(1);

    const twice = await postJson(
      port,
      `/operator/reconciliation/differences/${target.id}/resolve`,
      { note: 'again' },
      operator,
    );
    expect(twice.status).toBe(409);
    const unknown = await postJson(
      port,
      `/operator/reconciliation/differences/${randomUUID()}/resolve`,
      { note: 'x' },
      operator,
    );
    expect(unknown.status).toBe(404);
    const notAnId = await postJson(
      port,
      '/operator/reconciliation/differences/nope/resolve',
      { note: 'x' },
      operator,
    );
    expect(notAnId.status).toBe(404);

    const resolvedList = await getJson(
      port,
      '/operator/reconciliation/differences?state=resolved',
      operator,
    );
    const resolvedRows = (
      resolvedList.body as { differences: { id: string; resolvedByEmail: string | null }[] }
    ).differences;
    expect(resolvedRows.map((row) => row.id)).toContain(target.id);
    // Slice 9.9: who resolved it, by email, for the console to show.
    expect(resolvedRows.find((row) => row.id === target.id)?.resolvedByEmail).toBe(operatorEmail);
    const signedOut = await getJson(port, '/operator/reconciliation/differences');
    expect(signedOut.status).toBe(401);
  });
});

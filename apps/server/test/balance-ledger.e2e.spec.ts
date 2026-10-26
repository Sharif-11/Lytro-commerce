import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType, RateKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { RateService } from '../src/modules/balance/services/rate.service';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import { LOW_BALANCE_NOTIFIER } from '../src/modules/balance/tokens';
import { ApiError } from '../src/common/api-error';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { LowBalanceCapture } from './support/low-balance-capture';
import { cookieFrom, getJson, patchJson, postJson, type HttpResult } from './support/http';

// The balance ledger and rates, over the real database (BAL-01 to BAL-18, RAT-01 to RAT-14). Direct-service
// tests exercise what matters most here — real Postgres locking (BAL-11) and the insert-only trigger — the
// same reason ENGINEERING-STANDARDS' "integration test" layer injects a service against a real database rather
// than going through HTTP for every assertion. A handful of HTTP smoke tests prove the controllers/guards wire
// up correctly. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_balance_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const BCRYPT_TIMEOUT_MS = 30_000;
const PASSWORD = 'correct-horse-9';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let appUrl: string;
let balance: BalanceService;
let rates: RateService;
let overrides: PlanLimitOverridesService;
const texts = new SmsCapture();
const lowBalance = new LowBalanceCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);
const patch = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  patchJson(port, path, payload, headers);

// BAL-14: the CSV export route returns raw text, which support/http.ts's shared getJson would fail trying
// to JSON.parse -- a small local helper, the same fix data-export.e2e.spec.ts already needed for its own
// non-JSON download route, kept local rather than touching the shared JSON-only helper.
interface TextResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}
function getText(path: string, headers: Record<string, string>): Promise<TextResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: `/api/v1${path}`, method: 'GET', headers },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const freshSlug = (): string => `b${randomUUID().replace(/-/g, '').slice(0, 10)}`;

async function freshTenant(): Promise<string> {
  return seedShop(admin, `Shop ${freshSlug()}`, freshSlug());
}

async function tenantIdOf(slug: string): Promise<string> {
  const row = await admin.query<{ id: string }>('SELECT id FROM control.tenants WHERE slug = $1', [
    slug,
  ]);
  const id = row.rows[0]?.id;
  if (!id) throw new Error(`no tenant for slug ${slug}`);
  return id;
}

function errorOf(result: HttpResult): unknown {
  return (result.body as { error?: unknown }).error;
}

interface Owner {
  phone: string;
  slug: string;
  cookie: string;
  csrfToken: string;
}

async function owner(): Promise<Owner> {
  const phone = texts.freshPhone();
  const slug = freshSlug();
  await post('/auth/phone/code', { phone });
  const entered = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  const session = {
    cookie: cookieFrom(entered),
    csrfToken: (entered.body as { csrfToken: string }).csrfToken,
  };
  const headers = { cookie: session.cookie, 'x-csrf-token': session.csrfToken };
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    headers,
  );
  expect(shop.status).toBe(201);
  return { phone, slug, ...session };
}

function shopCall(who: Owner): Record<string, string> {
  return {
    cookie: who.cookie,
    'x-csrf-token': who.csrfToken,
    host: 'localhost',
    'x-lytro-shop': who.slug,
  };
}

async function createOperator(email: string): Promise<void> {
  const passwordHash = await hash(PASSWORD, 12);
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, passwordHash],
  );
}

async function enrollOperator(email: string): Promise<{ cookie: string; csrfToken: string }> {
  const signedIn = await post('/auth/operator/signin', { email, password: PASSWORD });
  const { secret } = signedIn.body as { secret: string };
  const code = await generate({ secret });
  const response = await post('/auth/operator/enroll', { email, password: PASSWORD, code });
  const body = response.body as { csrfToken: string };
  return { cookie: cookieFrom(response), csrfToken: body.csrfToken };
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  appUrl = appDbUrl;
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'balance-e2e-otp-secret-0123456789abcdefgh';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(LOW_BALANCE_NOTIFIER)
    .useValue(lowBalance)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  balance = app.get(BalanceService);
  rates = app.get(RateService);
  overrides = app.get(PlanLimitOverridesService);
}, BCRYPT_TIMEOUT_MS);

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('balance ledger (BAL-01 to BAL-18)', () => {
  it('BAL-11: exactly 50 of 100 concurrent 1-TK charges succeed against a 50 TK balance', async () => {
    const tenantId = await freshTenant();
    await balance.creditStandalone({ tenantId, amount: '50.00', type: LedgerEntryType.TopUp });

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        balance.chargeStandalone({ tenantId, amount: '1.00', type: LedgerEntryType.Sms }),
      ),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(succeeded).toHaveLength(50);
    expect(failed).toHaveLength(50);
    for (const result of failed) {
      expect(result.reason).toBeInstanceOf(ApiError);
    }

    const current = await balance.current(tenantId);
    expect(current.amount).toBe('0.00');

    const rows = await admin.query<{ count: string }>(
      `SELECT count(*)::text FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'sms'`,
      [tenantId],
    );
    expect(rows.rows[0]?.count).toBe('50');
  });

  it('BAL-13: a low-balance notice fires once per threshold crossing, never on an SMS, never again while already past it', async () => {
    const tenantId = await freshTenant();
    await balance.creditStandalone({ tenantId, amount: '60.00', type: LedgerEntryType.TopUp });

    // Crosses 50 TK downward (60 -> 45): one notice.
    await balance.chargeStandalone({ tenantId, amount: '15.00', type: LedgerEntryType.Sms });
    expect(lowBalance.forTenant(tenantId)).toEqual([
      { tenantId, thresholdPaisa: 5000n, balanceAfter: '45.00' },
    ]);

    // Stays above 0 (45 -> 5): no new notice, and the 50 TK notice doesn't repeat.
    await balance.chargeStandalone({
      tenantId,
      amount: '40.00',
      type: LedgerEntryType.Sms,
      overdraftFloor: '-50',
    });
    expect(lowBalance.forTenant(tenantId)).toHaveLength(1);

    // Crosses 0 downward (5 -> -5): a second, independent notice.
    await balance.chargeStandalone({
      tenantId,
      amount: '10.00',
      type: LedgerEntryType.Sms,
      overdraftFloor: '-50',
    });
    expect(lowBalance.forTenant(tenantId)).toEqual([
      { tenantId, thresholdPaisa: 5000n, balanceAfter: '45.00' },
      { tenantId, thresholdPaisa: 0n, balanceAfter: '-5.00' },
    ]);

    // Already past 0 (-5 -> -10): no new notice.
    await balance.chargeStandalone({
      tenantId,
      amount: '5.00',
      type: LedgerEntryType.Sms,
      overdraftFloor: '-50',
    });
    expect(lowBalance.forTenant(tenantId)).toHaveLength(2);

    expect(texts.sent).toHaveLength(0);
  });

  it('PHASE-2-PLAN exit criterion 3: control.tenants.balance_amount is always re-derivable as the sum of its own ledger rows', async () => {
    const tenantId = await freshTenant();

    async function sumOfLedger(): Promise<string> {
      const rows = await admin.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS total FROM tenant.balance_ledger WHERE tenant_id = $1`,
        [tenantId],
      );
      return Number(rows.rows[0]?.total ?? '0').toFixed(2);
    }

    async function assertReDerivable(): Promise<void> {
      const stored = (await balance.current(tenantId)).amount;
      expect(stored).toBe(await sumOfLedger());
    }

    await assertReDerivable(); // a fresh tenant: zero rows, zero balance.
    await balance.creditStandalone({ tenantId, amount: '100.00', type: LedgerEntryType.TopUp });
    await assertReDerivable();
    await balance.chargeStandalone({ tenantId, amount: '37.50', type: LedgerEntryType.Sms });
    await assertReDerivable();
    await balance.chargeStandalone({
      tenantId,
      amount: '80.00',
      type: LedgerEntryType.Ai,
      overdraftFloor: '-50',
    });
    await assertReDerivable();
    await balance.creditStandalone({ tenantId, amount: '12.25', type: LedgerEntryType.TopUp });
    await assertReDerivable();
  });

  it('BAL-02, DAT-10: the ledger is insert-only for every role, including the schema owner', async () => {
    const tenantId = await freshTenant();
    await balance.creditStandalone({ tenantId, amount: '10.00', type: LedgerEntryType.TopUp });
    const row = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.balance_ledger WHERE tenant_id = $1 LIMIT 1',
      [tenantId],
    );
    const id = row.rows[0]?.id;
    await expect(
      admin.query('UPDATE tenant.balance_ledger SET amount = 999 WHERE id = $1', [id]),
    ).rejects.toThrow(/insert-only/);
    await expect(
      admin.query('DELETE FROM tenant.balance_ledger WHERE id = $1', [id]),
    ).rejects.toThrow(/insert-only/);
  });

  it('SMS-06, BAL-10: an overdraft floor allows exactly one charge past zero, never two', async () => {
    const tenantId = await freshTenant();
    await balance.chargeStandalone({
      tenantId,
      amount: '5.00',
      type: LedgerEntryType.Sms,
      overdraftFloor: '-5',
    });
    const afterFirst = await balance.current(tenantId);
    expect(afterFirst.amount).toBe('-5.00');

    await expect(
      balance.chargeStandalone({
        tenantId,
        amount: '0.01',
        type: LedgerEntryType.Sms,
        overdraftFloor: '-5',
      }),
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('BAL-07, BAL-08: a frozen balance refuses both a charge and a credit', async () => {
    const tenantId = await freshTenant();
    await balance.runStandalone(tenantId, (tx) => balance.freeze(tx, tenantId));
    await expect(
      balance.chargeStandalone({ tenantId, amount: '1.00', type: LedgerEntryType.Sms }),
    ).rejects.toMatchObject({ code: 'tenant_offline' });
    await expect(
      balance.creditStandalone({ tenantId, amount: '1.00', type: LedgerEntryType.TopUp }),
    ).rejects.toMatchObject({ code: 'tenant_offline' });

    await balance.runStandalone(tenantId, (tx) => balance.unfreeze(tx, tenantId));
    await expect(
      balance.creditStandalone({ tenantId, amount: '1.00', type: LedgerEntryType.TopUp }),
    ).resolves.toBeDefined();
  });

  it('BAL-16: a units x rate charge computes the amount and stores both', async () => {
    const tenantId = await freshTenant();
    await balance.creditStandalone({ tenantId, amount: '10.00', type: LedgerEntryType.TopUp });
    const entry = await balance.chargeStandalone({
      tenantId,
      type: LedgerEntryType.Sms,
      units: '2',
      rateUsed: '0.55',
    });
    expect(entry.amount).toBe('-1.10');
    expect(entry.units).toBe('2.00');
    expect(entry.rateUsed).toBe('0.5500');
  });

  it('BAL-16: units x rate rounds to the paisa, and takes a rate as stored, with four decimals', async () => {
    const tenantId = await freshTenant();
    await balance.creditStandalone({ tenantId, amount: '10.00', type: LedgerEntryType.TopUp });

    // 1.5 x 0.55 = 0.825, rounded half up to 0.83.
    const half = await balance.chargeStandalone({
      tenantId,
      type: LedgerEntryType.Sms,
      units: '1.5',
      rateUsed: '0.55',
    });
    expect(half.amount).toBe('-0.83');

    // The rate exactly as control.rates holds it ('0.5500'), and one using all four decimals.
    const stored = await rates.current(RateKey.SmsPerUnit);
    const asStored = await balance.chargeStandalone({
      tenantId,
      type: LedgerEntryType.Sms,
      units: '2',
      rateUsed: stored?.value ?? '',
    });
    expect(asStored.amount).toBe('-1.10');
    const fine = await balance.chargeStandalone({
      tenantId,
      type: LedgerEntryType.Sms,
      units: '3',
      rateUsed: '0.5525',
    });
    expect(fine.amount).toBe('-1.66'); // 1.6575
    expect(fine.rateUsed).toBe('0.5525');
  });

  it('BAL-17: an operator adjustment needs a reason and is audited', async () => {
    const tenantId = await freshTenant();
    await expect(
      balance.adjustStandalone({
        tenantId,
        amount: '10.00',
        reason: '  ',
        operatorId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'validation_error' });

    const operatorId = randomUUID();
    await balance.adjustStandalone({
      tenantId,
      amount: '25.00',
      reason: 'manual correction for a failed listener sync',
      operatorId,
    });
    const current = await balance.current(tenantId);
    expect(current.amount).toBe('25.00');

    const audited = await admin.query<{ count: string }>(
      `SELECT count(*)::text FROM control.platform_audit_log
       WHERE action = 'balance_adjusted' AND target_id = $1`,
      [tenantId],
    );
    expect(audited.rows[0]?.count).toBe('1');
  });

  it('ADM-08: an operator adjustment and its platform audit entry commit together or not at all', async () => {
    const tenantId = await freshTenant();
    // The platform log refuses this one write, the way a dropped connection or a crash would lose it.
    await admin.query(
      `CREATE FUNCTION public.refuse_audit() RETURNS trigger LANGUAGE plpgsql
       AS $$ BEGIN RAISE EXCEPTION 'audit write lost'; END $$`,
    );
    await admin.query(
      `CREATE TRIGGER refuse_audit BEFORE INSERT ON control.platform_audit_log
       FOR EACH ROW WHEN (NEW.target_id = '${tenantId}') EXECUTE FUNCTION public.refuse_audit()`,
    );
    try {
      await expect(
        balance.adjustStandalone({
          tenantId,
          amount: '25.00',
          reason: 'manual correction',
          operatorId: randomUUID(),
        }),
      ).rejects.toThrow(/audit write lost/);
    } finally {
      await admin.query('DROP TRIGGER refuse_audit ON control.platform_audit_log');
      await admin.query('DROP FUNCTION public.refuse_audit()');
    }

    expect((await balance.current(tenantId)).amount).toBe('0.00');
    const entries = await admin.query<{ count: string }>(
      'SELECT count(*)::text FROM tenant.balance_ledger WHERE tenant_id = $1',
      [tenantId],
    );
    expect(entries.rows[0]?.count).toBe('0');
  });
});

describeIfDatabase('the database keeps the balance (BAL-02, BAL-11, DAT-10)', () => {
  async function storedBalance(tenantId: string): Promise<string> {
    const row = await admin.query<{ amount: string }>(
      'SELECT balance_amount::text AS amount FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    return row.rows[0]?.amount ?? '';
  }

  it('an entry moves the balance and fills balance_after, whatever its writer passed', async () => {
    const tenantId = await freshTenant();
    await balance.creditStandalone({ tenantId, amount: '40.00', type: LedgerEntryType.TopUp });

    // Straight into the table as the schema owner, with a made-up balance_after.
    const row = await admin.query<{ balance_after: string }>(
      `INSERT INTO tenant.balance_ledger (tenant_id, type, amount, balance_after)
       VALUES ($1, 'adjustment', '-15.00', '999.00') RETURNING balance_after::text`,
      [tenantId],
    );
    expect(row.rows[0]?.balance_after).toBe('25.00');
    expect(await storedBalance(tenantId)).toBe('25.00');
  });

  it('a balance changes only through an entry, for the app role and the schema owner alike', async () => {
    const tenantId = await freshTenant();
    await balance.creditStandalone({ tenantId, amount: '10.00', type: LedgerEntryType.TopUp });

    await expect(
      admin.query("UPDATE control.tenants SET balance_amount = '500.00' WHERE id = $1", [tenantId]),
    ).rejects.toThrow(/only through a balance-ledger entry/);
    const appClient = new pg.Client({ connectionString: appUrl });
    await appClient.connect();
    try {
      await expect(
        appClient.query("UPDATE control.tenants SET balance_amount = '500.00' WHERE id = $1", [
          tenantId,
        ]),
      ).rejects.toThrow(/only through a balance-ledger entry/);
      // The tenant row's other columns still change as before.
      await appClient.query('UPDATE control.tenants SET balance_frozen = true WHERE id = $1', [
        tenantId,
      ]);
    } finally {
      await appClient.end();
    }
    expect(await storedBalance(tenantId)).toBe('10.00');

    // A new shop starts at zero.
    await expect(
      admin.query(
        `INSERT INTO control.tenants (owner_identity_id, subscriber_id, shop_name, slug, balance_amount)
         SELECT owner_identity_id, subscriber_id, 'Copy', $2, '50.00' FROM control.tenants WHERE id = $1`,
        [tenantId, freshSlug()],
      ),
    ).rejects.toThrow(/only through a balance-ledger entry/);
  });

  it('an entry of nothing, or of an unknown kind, is refused; so is a charge of nothing or less', async () => {
    const tenantId = await freshTenant();
    await expect(
      admin.query(
        "INSERT INTO tenant.balance_ledger (tenant_id, type, amount) VALUES ($1, 'adjustment', 0)",
        [tenantId],
      ),
    ).rejects.toThrow(/balance_ledger_amount_nonzero/);
    await expect(
      admin.query(
        "INSERT INTO tenant.balance_ledger (tenant_id, type, amount) VALUES ($1, 'gift', '5.00')",
        [tenantId],
      ),
    ).rejects.toThrow(/invalid input value for enum/);
    for (const amount of ['0.00', '-5.00']) {
      await expect(
        balance.chargeStandalone({ tenantId, amount, type: LedgerEntryType.Sms }),
      ).rejects.toThrow('charge amount must be positive');
    }
    expect(await storedBalance(tenantId)).toBe('0.00');
  });

  it('DAT-10: the append-only tables refuse a TRUNCATE, even from the schema owner', async () => {
    for (const table of [
      'tenant.balance_ledger',
      'tenant.activity_log',
      'tenant.stock_movements',
    ]) {
      await expect(admin.query(`TRUNCATE ${table}`)).rejects.toThrow(/insert-only/);
    }
  });

  it('BAL-01: reading the balance never waits behind a charge holding the lock', async () => {
    const tenantId = await freshTenant();
    await balance.creditStandalone({ tenantId, amount: '10.00', type: LedgerEntryType.TopUp });

    const holder = new pg.Client({ connectionString: appUrl });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM control.tenants WHERE id = $1 FOR UPDATE', [tenantId]);
      const outcome = await Promise.race([
        balance.current(tenantId).then((snapshot) => snapshot.amount),
        new Promise<string>((resolve) =>
          setTimeout(() => {
            resolve('still waiting');
          }, 2_000),
        ),
      ]);
      expect(outcome).toBe('10.00');
    } finally {
      await holder.query('ROLLBACK');
      await holder.end();
    }
  });
});

describeIfDatabase('rates (RAT-01 to RAT-14)', () => {
  it('RAT-02, RAT-03: a rate change is effective immediately and never rewrites a past entry', async () => {
    const before = await rates.current(RateKey.SmsPerUnit);
    expect(before?.value).toBe('0.5500');

    const operatorId = randomUUID();
    await rates.change(RateKey.SmsPerUnit, '0.70', operatorId, null);

    const after = await rates.current(RateKey.SmsPerUnit);
    expect(after?.value).toBe('0.7000');

    const history = await rates.history(RateKey.SmsPerUnit);
    expect(history[0]).toMatchObject({
      oldValue: '0.5500',
      newValue: '0.7000',
      changedBy: operatorId,
    });

    // Restore it so other tests in this file keep seeing the seeded default.
    await rates.change(RateKey.SmsPerUnit, '0.55', operatorId, null);
  });

  it('RAT-08: a negative rate is rejected', async () => {
    await expect(rates.change(RateKey.AiReply, '-1', randomUUID(), null)).rejects.toMatchObject({
      code: 'validation_error',
    });
  });
});

describeIfDatabase('balance and rates over HTTP (controller wiring)', () => {
  it("AUD-08, ADM-04: an operator's adjustment and limit override show in the shop's activity as Platform support", async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    const operatorId = randomUUID();
    await balance.adjustStandalone({
      tenantId,
      amount: '15.00',
      reason: 'refund for a failed courier booking',
      operatorId,
    });
    await overrides.set(tenantId, 'products', 500, 'launch week allowance', operatorId);
    await overrides.remove(tenantId, 'products', operatorId);

    const response = await get('/activity', shopCall(who));
    expect(response.status).toBe(200);
    const entries = (
      response.body as {
        entries: {
          action: string;
          actorType: string;
          actorId: string | null;
          actorName: string;
          summary: unknown;
        }[];
      }
    ).entries.filter((entry) => entry.actorType === 'platform_support');
    expect(entries.map((entry) => entry.action).sort()).toEqual([
      'balance_adjusted',
      'plan_limit_override_removed',
      'plan_limit_override_set',
    ]);
    for (const entry of entries) {
      expect(entry.actorName).toBe('Platform support');
      expect(entry.actorId).toBeNull(); // never the operator's own id
    }
    expect(entries.find((entry) => entry.action === 'balance_adjusted')?.summary).toEqual({
      amount: '15.00',
      reason: 'refund for a failed courier booking',
    });
    expect(entries.find((entry) => entry.action === 'plan_limit_override_set')?.summary).toEqual({
      limitKey: 'products',
      value: 500,
      reason: 'launch week allowance',
    });
  });

  it("reads an owner's own balance and the current-rates page", async () => {
    const who = await owner();
    const response = await get('/balance', shopCall(who));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ amount: '0.00', frozen: false });

    const ratesResponse = await get('/balance/current-rates', shopCall(who));
    expect(ratesResponse.status).toBe(200);
    expect((ratesResponse.body as unknown[]).length).toBeGreaterThan(0);
  });

  it("shows a shop only its own balance and ledger, never another shop's (BAL-01, RLS)", async () => {
    const shopA = await owner();
    const shopB = await owner();
    const idRow = await admin.query<{ id: string }>(
      'SELECT id FROM control.tenants WHERE slug = $1',
      [shopB.slug],
    );
    const shopBId = idRow.rows[0]?.id;
    expect(shopBId).toBeDefined();
    await balance.adjustStandalone({
      tenantId: shopBId ?? '',
      amount: '42.00',
      reason: 'isolation test fixture',
      operatorId: randomUUID(),
    });

    const balanceA = await get('/balance', shopCall(shopA));
    expect(balanceA.body).toMatchObject({ amount: '0.00' });

    const ledgerA = await get('/balance/ledger', shopCall(shopA));
    expect(ledgerA.body).toMatchObject({ entries: [] });

    const balanceB = await get('/balance', shopCall(shopB));
    expect(balanceB.body).toMatchObject({ amount: '42.00' });
  });

  it('BAL-14: exports the filtered statement as CSV, scoped to the session shop only', async () => {
    const who = await owner();
    await balance.creditStandalone({
      tenantId: await tenantIdOf(who.slug),
      amount: '42.00',
      type: LedgerEntryType.TopUp,
    });

    const response = await getText('/balance/ledger/export', shopCall(who));
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    const lines = response.body.trim().split('\n');
    expect(lines[0]).toBe('id,type,amount,units,rateUsed,balanceAfter,createdAt');
    expect(lines.length).toBe(2); // header + the one credit above
    expect(lines[1]).toContain('top_up');
    expect(lines[1]).toContain('42.00');

    // Scoped to the session shop only -- a different shop's export is empty.
    const other = await owner();
    const otherResponse = await getText('/balance/ledger/export', shopCall(other));
    expect(otherResponse.body.trim().split('\n').length).toBe(1); // header only
  });

  it('BAL-14: filters the statement by one type or several, comma-separated', async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    await balance.creditStandalone({ tenantId, amount: '100.00', type: LedgerEntryType.TopUp });
    for (const [type, amount] of [
      [LedgerEntryType.OrderFee, '5.00'],
      [LedgerEntryType.ProductFee, '2.00'],
      [LedgerEntryType.Sms, '1.00'],
      [LedgerEntryType.FraudCheck, '1.50'],
    ] as const) {
      await balance.chargeStandalone({ tenantId, type, amount });
    }
    const typesOf = (body: unknown): string[] =>
      (body as { entries: { type: string }[] }).entries.map((entry) => entry.type).sort();

    const fees = await get('/balance/ledger?type=order_fee,product_fee,fraud_check', shopCall(who));
    expect(fees.status).toBe(200);
    expect(typesOf(fees.body)).toEqual(['fraud_check', 'order_fee', 'product_fee']);

    const topUps = await get('/balance/ledger?type=top_up', shopCall(who));
    expect(typesOf(topUps.body)).toEqual(['top_up']);

    const unknown = await get('/balance/ledger?type=order_fee,refund', shopCall(who));
    expect(unknown.status).toBe(400);

    const csv = await getText('/balance/ledger/export?type=order_fee,product_fee', shopCall(who));
    const rows = csv.body.trim().split('\n').slice(1);
    expect(rows.map((row) => row.split(',')[1]).sort()).toEqual(['order_fee', 'product_fee']);
  });

  it(
    'lets an operator read and change a rate, and adjust a balance',
    async () => {
      const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
      await createOperator(email);
      const session = await enrollOperator(email);
      const headers = { cookie: session.cookie, 'x-csrf-token': session.csrfToken };

      const list = await get('/operator/rates', headers);
      expect(list.status).toBe(200);

      const changed = await patch('/operator/rates/fraud_check', { value: 2 }, headers);
      expect(changed.status).toBe(200);

      const tenantId = await freshTenant();
      const adjusted = await post(
        `/operator/tenants/${tenantId}/balance-adjust`,
        { amount: 15, reason: 'promotional credit' },
        headers,
      );
      expect(adjusted.status).toBe(200);
      expect(adjusted.body).toMatchObject({ amount: '15.00' });
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'refuses an unknown rate key with not_found',
    async () => {
      const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
      await createOperator(email);
      const session = await enrollOperator(email);
      const headers = { cookie: session.cookie, 'x-csrf-token': session.csrfToken };
      const response = await patch('/operator/rates/not_a_real_key', { value: 1 }, headers);
      expect(response.status).toBe(404);
      expect(errorOf(response)).toMatchObject({ code: 'not_found' });
    },
    BCRYPT_TIMEOUT_MS,
  );
});

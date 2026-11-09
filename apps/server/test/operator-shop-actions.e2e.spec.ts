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
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, postJson, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// ADM-04, ADM-13 (Phase 8 Slice 8.3, read agreed 2026-11-08): extending a plan, resetting an owner's sign-in and deleting a
// shop's data on request, over real HTTP and the real database. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_operator_shop_actions_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SLOW_MS = 60_000;
// Migrating a fresh database and starting the app, which is slow while other suites run beside it.
const SETUP_MS = 180_000;
const PASSWORD = 'correct-pw9';
const DAY_MS = 24 * 60 * 60 * 1000;
const REASON = 'Asked by the owner on WhatsApp';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let appDb: pg.Client;
let planId = '';
let termId = '';
let operatorId = '';
let operator: Record<string, string> = {};
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'shop-actions-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  appDb = new pg.Client({ connectionString: urls.appDbUrl });
  await appDb.connect();
  planId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ('Shop actions plan', 980, true, $1) RETURNING id`,
        [JSON.stringify({ products: 100, staff: 3, storage_mb: 2048, bandwidth_gb: null })],
      )
    ).rows[0]?.id ?? '';
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', 'Shop actions month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, 449)',
    [planId, termId],
  );
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  operatorId =
    (
      await admin.query<{ id: string }>(
        'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2) RETURNING id',
        [email, await hash(PASSWORD, 12)],
      )
    ).rows[0]?.id ?? '';
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
}, SETUP_MS);

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
  await appDb.end();
});

async function shopOnPlan(prefix: string): Promise<ShopClient> {
  const shop = await openShop(port, texts, prefix);
  await app.get(BalanceService).creditStandalone({
    tenantId: shop.tenantId,
    amount: '5000.00',
    type: LedgerEntryType.TopUp,
  });
  const purchase = app.get(PurchaseService);
  const quote = await purchase.quote(shop.tenantId, planId, termId);
  await purchase.confirmFromBalance(quote.id, shop.tenantId);
  return shop;
}

function act(shop: ShopClient, path: string, body: unknown): Promise<HttpResult> {
  return postJson(port, `/operator/tenants/${shop.tenantId}/${path}`, body, operator);
}

function ok(answer: HttpResult, status = 200): unknown {
  expect(answer.status, JSON.stringify(answer.body)).toBe(status);
  return answer.body;
}

interface ShopRow {
  state: string;
  period_end: Date | null;
  balance_frozen: boolean;
  archived_at: Date | null;
  lapse_schedule_snapshot: unknown;
  slug: string;
}

async function shopRow(tenantId: string): Promise<ShopRow> {
  const { rows } = await admin.query<ShopRow>(
    `SELECT state, period_end, balance_frozen, archived_at, lapse_schedule_snapshot, slug FROM control.tenants
     WHERE id = $1`,
    [tenantId],
  );
  if (!rows[0]) throw new Error('no such shop');
  return rows[0];
}

/** Puts a shop some days past its end, in this state, as the lifecycle job would have left it. */
async function lapse(tenantId: string, state: string, daysAgo: number): Promise<Date> {
  const end = new Date(Date.now() - daysAgo * DAY_MS);
  await admin.query(
    `UPDATE control.tenants
     SET state = $2, period_end = $3, balance_frozen = true, lapse_schedule_snapshot = '{"grace":3}',
         archived_at = $4
     WHERE id = $1`,
    [tenantId, state, end, state === 'archived' ? new Date() : null],
  );
  return end;
}

async function activity(tenantId: string, action: string) {
  const { rows } = await admin.query<{
    actor_type: string;
    actor_id: string | null;
    summary: Record<string, unknown>;
  }>(
    'SELECT actor_type, actor_id, summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
    [tenantId, action],
  );
  return rows;
}

async function platformAudit(tenantId: string, action: string) {
  const { rows } = await admin.query<{
    actor_type: string;
    actor_id: string | null;
    summary: Record<string, unknown>;
  }>(
    'SELECT actor_type, actor_id, summary FROM control.platform_audit_log WHERE target_id = $1 AND action = $2',
    [tenantId, action],
  );
  return rows;
}

describeIfDatabase('ADM-04: extending a plan by days', () => {
  it(
    'adds whole days to the period, with its reason in both logs',
    async () => {
      const shop = await shopOnPlan('extend');
      const before = await shopRow(shop.tenantId);
      const body = ok(await act(shop, 'extend', { days: 10, reason: REASON })) as {
        periodEnd: string;
        state: string;
        restored: boolean;
      };
      const after = await shopRow(shop.tenantId);
      expect(after.period_end?.getTime()).toBe((before.period_end?.getTime() ?? 0) + 10 * DAY_MS);
      expect(body).toMatchObject({ state: 'active', restored: false });
      expect(new Date(body.periodEnd).getTime()).toBe(after.period_end?.getTime());
      const [entry] = await activity(shop.tenantId, 'plan_extended');
      expect(entry).toMatchObject({ actor_type: 'platform_support', actor_id: null });
      expect(entry?.summary).toMatchObject({ days: 10, reason: REASON, restored: false });
      const [record] = await platformAudit(shop.tenantId, 'plan_extended');
      expect(record).toMatchObject({ actor_type: 'operator', actor_id: operatorId });
      expect(record?.summary).toMatchObject({ days: 10, reason: REASON });
    },
    SLOW_MS,
  );

  it(
    'gives a trial more days and leaves it a trial',
    async () => {
      const shop = await openShop(port, texts, 'trial');
      const before = await shopRow(shop.tenantId);
      expect(before.state).toBe('trial');
      ok(await act(shop, 'extend', { days: 7, reason: REASON }));
      const after = await shopRow(shop.tenantId);
      expect(after.state).toBe('trial');
      expect(after.period_end?.getTime()).toBe((before.period_end?.getTime() ?? 0) + 7 * DAY_MS);
    },
    SLOW_MS,
  );

  it(
    "brings a lapsed shop back to active with its balance unfrozen, but an operator's suspension holds (LIF-15, LIF-24)",
    async () => {
      for (const state of ['grace', 'read_only', 'locked', 'archived']) {
        const shop = await shopOnPlan('lapsed');
        await lapse(shop.tenantId, state, 3);
        const body = ok(await act(shop, 'extend', { days: 10, reason: REASON })) as {
          state: string;
          restored: boolean;
        };
        expect(body, state).toMatchObject({ state: 'active', restored: true });
        const after = await shopRow(shop.tenantId);
        expect(after, state).toMatchObject({
          state: 'active',
          balance_frozen: false,
          archived_at: null,
          lapse_schedule_snapshot: null,
        });
      }
      const suspended = await shopOnPlan('suspended');
      await lapse(suspended.tenantId, 'read_only', 3);
      await admin.query(
        "UPDATE control.tenants SET suspended_at = now(), suspended_reason = 'Fraud' WHERE id = $1",
        [suspended.tenantId],
      );
      ok(await act(suspended, 'extend', { days: 10, reason: REASON }));
      expect(await shopRow(suspended.tenantId)).toMatchObject({
        state: 'active',
        balance_frozen: true,
      });
    },
    SLOW_MS * 2,
  );

  it(
    'moves the add-ons and a scheduled change that end with the plan, and only those (D8-34, D8-35)',
    async () => {
      const shop = await shopOnPlan('addons');
      const end = (await shopRow(shop.tenantId)).period_end ?? new Date();
      const own = new Date(end.getTime() + 40 * DAY_MS);
      const hold = async (expires: Date, status: string): Promise<string> =>
        (
          await admin.query<{ id: string }>(
            `INSERT INTO control.addon_purchases (tenant_id, addon_id, kind, price, status, paid_from, starts_at, expires_at)
             SELECT $1, id, 'feature', 149, $3, 'balance', now() - interval '1 day', $2
             FROM control.addons WHERE key = 'brand_identity' RETURNING id`,
            [shop.tenantId, expires, status],
          )
        ).rows[0]?.id ?? '';
      const withPlan = await hold(end, 'active');
      const ownEnd = await hold(own, 'active');
      const lapsedOne = await hold(end, 'lapsed');
      await admin.query(
        `INSERT INTO control.scheduled_plan_changes (tenant_id, kind, target_plan_id, effective_at)
         VALUES ($1, 'pay_as_you_go_switch', NULL, $2)`,
        [shop.tenantId, end],
      );

      ok(await act(shop, 'extend', { days: 5, reason: REASON }));
      const moved = new Date(end.getTime() + 5 * DAY_MS).getTime();
      const expiresOf = async (id: string): Promise<number> =>
        (
          await admin.query<{ expires_at: Date }>(
            'SELECT expires_at FROM control.addon_purchases WHERE id = $1',
            [id],
          )
        ).rows[0]?.expires_at.getTime() ?? 0;
      expect(await expiresOf(withPlan)).toBe(moved);
      expect(await expiresOf(ownEnd)).toBe(own.getTime());
      expect(await expiresOf(lapsedOne)).toBe(end.getTime());
      const { rows } = await admin.query<{ effective_at: Date }>(
        'SELECT effective_at FROM control.scheduled_plan_changes WHERE tenant_id = $1',
        [shop.tenantId],
      );
      expect(rows[0]?.effective_at.getTime()).toBe(moved);
    },
    SLOW_MS,
  );

  it(
    'refuses a bad number of days, no reason, a shop with no period, and days that still end in the past',
    async () => {
      const shop = await shopOnPlan('refused');
      const before = await shopRow(shop.tenantId);
      for (const body of [
        { days: 0, reason: REASON },
        { days: 31, reason: REASON },
        { days: 1.5, reason: REASON },
        { days: 5, reason: '   ' },
        { days: 5 },
      ]) {
        expect((await act(shop, 'extend', body)).status, JSON.stringify(body)).toBe(400);
      }
      expect((await shopRow(shop.tenantId)).period_end).toEqual(before.period_end);

      const payg = await openShop(port, texts, 'payg');
      await admin.query(
        "UPDATE control.tenants SET state = 'pay_as_you_go', period_end = NULL WHERE id = $1",
        [payg.tenantId],
      );
      expect((await act(payg, 'extend', { days: 5, reason: REASON })).status).toBe(409);
      // Pay-as-you-go has no period to extend, even with a date left on its row.
      await admin.query(
        "UPDATE control.tenants SET period_end = now() + interval '3 days' WHERE id = $1",
        [payg.tenantId],
      );
      expect((await act(payg, 'extend', { days: 5, reason: REASON })).status).toBe(409);

      const noExpiry = await shopOnPlan('noexpiry');
      await admin.query('UPDATE control.tenants SET period_end = NULL WHERE id = $1', [
        noExpiry.tenantId,
      ]);
      expect((await act(noExpiry, 'extend', { days: 5, reason: REASON })).status).toBe(409);

      const deleted = await shopOnPlan('deleted');
      await admin.query("UPDATE control.tenants SET state = 'deleted' WHERE id = $1", [
        deleted.tenantId,
      ]);
      expect((await act(deleted, 'extend', { days: 5, reason: REASON })).status).toBe(409);

      const longGone = await shopOnPlan('longgone');
      const end = await lapse(longGone.tenantId, 'archived', 45);
      const still = await act(longGone, 'extend', { days: 30, reason: REASON });
      expect(still.status).toBe(409);
      expect(await shopRow(longGone.tenantId)).toMatchObject({
        state: 'archived',
        period_end: end,
        balance_frozen: true,
      });
      expect(await activity(longGone.tenantId, 'plan_extended')).toEqual([]);
    },
    SLOW_MS,
  );
});

describeIfDatabase('ADM-04: resetting an owner sign-in', () => {
  async function ownerPhone(tenantId: string): Promise<string> {
    const { rows } = await admin.query<{ value: string }>(
      `SELECT si.value FROM control.tenants t JOIN control.subscriber_identities si ON si.id = t.owner_identity_id
       WHERE t.id = $1`,
      [tenantId],
    );
    return rows[0]?.value ?? '';
  }

  async function ownerRowPhone(tenantId: string): Promise<string | null> {
    const { rows } = await admin.query<{ phone: string | null }>(
      'SELECT phone FROM tenant.users WHERE tenant_id = $1 AND is_owner',
      [tenantId],
    );
    return rows[0]?.phone ?? null;
  }

  it(
    'replaces a lost phone at once, signs the owner out everywhere and sends the code to the new one (D8-36)',
    async () => {
      const shop = await openShop(port, texts, 'lost');
      const oldPhone = await ownerPhone(shop.tenantId);
      expect((await shop.get('/me')).status).toBe(200);
      const newPhone = texts.freshPhone();

      const body = ok(
        await act(shop, 'owner-reset', { phone: `+88 ${newPhone}`, reason: REASON }),
      ) as { phoneChanged: boolean };
      expect(body.phoneChanged).toBe(true);
      expect(await ownerPhone(shop.tenantId)).toBe(newPhone);
      expect(await ownerRowPhone(shop.tenantId)).toBe(newPhone);
      expect((await shop.get('/me')).status).toBe(401);

      // The lost phone no longer gets a code, whatever it asks.
      const before = texts.sent.length;
      await postJson(port, '/auth/forgot-password', { phone: oldPhone }, { host: 'localhost' });
      expect(texts.sent.slice(before).filter((sms) => sms.toPhone === oldPhone)).toEqual([]);

      // The code the operator's action sent signs the owner in, to set a new password.
      const verified = await postJson(
        port,
        '/auth/forgot-password/verify',
        { phone: newPhone, code: texts.codeFor(newPhone) },
        { host: 'localhost' },
      );
      expect(verified.status, JSON.stringify(verified.body)).toBe(200);

      const [entry] = await activity(shop.tenantId, 'owner_sign_in_reset');
      expect(entry).toMatchObject({ actor_type: 'platform_support', actor_id: null });
      expect(entry?.summary).toEqual({
        reason: REASON,
        phoneChanged: true,
        phoneEnding: newPhone.slice(-3),
      });
      const [record] = await platformAudit(shop.tenantId, 'owner_sign_in_reset');
      expect(record).toMatchObject({ actor_type: 'operator', actor_id: operatorId });
      expect(record?.summary).toMatchObject({ reason: REASON, from: oldPhone, to: newPhone });
    },
    SLOW_MS,
  );

  it(
    'with the same phone, still signs out everywhere and sends a code',
    async () => {
      const shop = await openShop(port, texts, 'same');
      const phone = await ownerPhone(shop.tenantId);
      const before = texts.sent.length;
      // Past the sign-up code's cooldown, as a real reset would be.
      await admin.query('DELETE FROM control.verification_challenges WHERE destination = $1', [
        phone,
      ]);
      const body = ok(await act(shop, 'owner-reset', { phone, reason: REASON })) as {
        phoneChanged: boolean;
      };
      expect(body.phoneChanged).toBe(false);
      expect((await shop.get('/me')).status).toBe(401);
      expect(texts.sent.slice(before).filter((sms) => sms.toPhone === phone).length).toBe(1);
      expect(await ownerPhone(shop.tenantId)).toBe(phone);
    },
    SLOW_MS,
  );

  it(
    'gives an owner who signed up by email a phone to sign in with',
    async () => {
      const shop = await openShop(port, texts, 'emailonly');
      await admin.query(
        `UPDATE control.subscriber_identities si SET kind = 'email', value = $2
         FROM control.tenants t WHERE t.id = $1 AND si.id = t.owner_identity_id`,
        [shop.tenantId, `owner.${randomUUID().slice(0, 8)}@example.com`],
      );
      await admin.query('UPDATE tenant.users SET phone = NULL WHERE tenant_id = $1 AND is_owner', [
        shop.tenantId,
      ]);
      const phone = texts.freshPhone();
      const body = ok(await act(shop, 'owner-reset', { phone, reason: REASON })) as {
        phoneChanged: boolean;
      };
      expect(body.phoneChanged).toBe(true);
      expect(await ownerRowPhone(shop.tenantId)).toBe(phone);
      const verified = await postJson(
        port,
        '/auth/forgot-password/verify',
        { phone, code: texts.codeFor(phone) },
        { host: 'localhost' },
      );
      expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    },
    SLOW_MS,
  );

  it(
    "refuses another account's phone and changes nothing, and a number that isn't one",
    async () => {
      const shop = await openShop(port, texts, 'taken');
      const other = await openShop(port, texts, 'taken-other');
      const oldPhone = await ownerPhone(shop.tenantId);
      const taken = await act(shop, 'owner-reset', {
        phone: await ownerPhone(other.tenantId),
        reason: REASON,
      });
      expect(taken.status).toBe(409);
      expect(await ownerPhone(shop.tenantId)).toBe(oldPhone);
      expect((await shop.get('/me')).status).toBe(200);
      expect(await activity(shop.tenantId, 'owner_sign_in_reset')).toEqual([]);

      expect((await act(shop, 'owner-reset', { phone: '12345', reason: REASON })).status).toBe(400);
      expect((await act(shop, 'owner-reset', { phone: oldPhone })).status).toBe(400);

      await admin.query("UPDATE control.tenants SET state = 'deleted' WHERE id = $1", [
        other.tenantId,
      ]);
      const gone = await act(other, 'owner-reset', { phone: texts.freshPhone(), reason: REASON });
      expect(gone.status).toBe(409);
    },
    SLOW_MS,
  );
});

describeIfDatabase('ADM-13: deleting a shop data on request', () => {
  /** One row in each Phase 7 table LIF-19 was missing, and one order. */
  async function seedPhase7(tenantId: string): Promise<void> {
    await admin.query(
      `INSERT INTO tenant.sms_log (tenant_id, kind, to_phone, units, cost, is_essential, status)
       VALUES ($1, 'order_placed', '01799999999', 1, 0.35, false, 'sent')`,
      [tenantId],
    );
    await admin.query('INSERT INTO tenant.sms_settings (tenant_id) VALUES ($1)', [tenantId]);
    await admin.query(
      `INSERT INTO tenant.fraud_checks (tenant_id, phone, trigger, steadfast_state, own_delivered, own_returned,
         own_cancelled, cost)
       VALUES ($1, '01799999999', 'staff', 'not_connected', 0, 0, 0, 0)`,
      [tenantId],
    );
    await admin.query('INSERT INTO tenant.fraud_rules (tenant_id, cod_orders) VALUES ($1, true)', [
      tenantId,
    ]);
    await admin.query(
      `INSERT INTO tenant.order_extractions (tenant_id, input_chars, confidence, paid_from, cost)
       VALUES ($1, 10, 0.9, 'balance', 1)`,
      [tenantId],
    );
  }

  const PHASE_7 = ['sms_log', 'sms_settings', 'fraud_checks', 'fraud_rules', 'order_extractions'];

  async function countsOf(tenantId: string): Promise<number[]> {
    const counts: number[] = [];
    for (const table of PHASE_7) {
      const { rows } = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM tenant.${table} WHERE tenant_id = $1`,
        [tenantId],
      );
      counts.push(rows[0]?.n ?? -1);
    }
    return counts;
  }

  it(
    "needs the shop's own address, then takes it offline at once with the reason in both logs and queues the job",
    async () => {
      const shop = await shopOnPlan('delete');
      const { slug } = await shopRow(shop.tenantId);
      for (const confirmAddress of ['another-shop', `${slug}x`]) {
        expect(
          (await act(shop, 'delete-data', { confirmAddress, reason: REASON })).status,
          confirmAddress,
        ).toBe(400);
      }
      expect((await act(shop, 'delete-data', { confirmAddress: slug })).status).toBe(400);
      expect((await shopRow(shop.tenantId)).state).toBe('active');

      ok(
        await act(shop, 'delete-data', {
          confirmAddress: ` ${slug.toUpperCase()} `,
          reason: REASON,
        }),
      );
      expect(await shopRow(shop.tenantId)).toMatchObject({
        state: 'archived',
        balance_frozen: true,
      });
      const [entry] = await activity(shop.tenantId, 'shop_data_deletion_requested');
      expect(entry).toMatchObject({ actor_type: 'platform_support', actor_id: null });
      expect(entry?.summary).toEqual({ reason: REASON });
      const [record] = await platformAudit(shop.tenantId, 'shop_data_deletion_requested');
      expect(record).toMatchObject({ actor_type: 'operator', actor_id: operatorId });
      expect(record?.summary).toMatchObject({ reason: REASON });
      const job = await admin.query(
        `SELECT 1 FROM control.job_outbox WHERE queue_name = 'shop_data_deletion' AND payload->>'tenantId' = $1`,
        [shop.tenantId],
      );
      expect(job.rowCount).toBe(1);
    },
    SLOW_MS,
  );

  it(
    "deletes the shop's data, Phase 7's tables among it, and keeps the account, balance and billing records",
    async () => {
      const shop = await shopOnPlan('erased');
      await seedPhase7(shop.tenantId);
      expect(await countsOf(shop.tenantId)).toEqual([1, 1, 1, 1, 1]);
      const { slug } = await shopRow(shop.tenantId);
      const balanceBefore = await admin.query<{ balance_amount: string; subscriber_id: string }>(
        'SELECT balance_amount, subscriber_id FROM control.tenants WHERE id = $1',
        [shop.tenantId],
      );
      ok(await act(shop, 'delete-data', { confirmAddress: slug, reason: REASON }));

      await app.get(LifecycleService).eraseRequested(shop.tenantId);

      expect((await shopRow(shop.tenantId)).state).toBe('deleted');
      expect(await countsOf(shop.tenantId)).toEqual([0, 0, 0, 0, 0]);
      const after = await admin.query<{ balance_amount: string }>(
        'SELECT balance_amount FROM control.tenants WHERE id = $1',
        [shop.tenantId],
      );
      expect(after.rows[0]?.balance_amount).toBe(balanceBefore.rows[0]?.balance_amount);
      const account = await admin.query('SELECT 1 FROM control.subscribers WHERE id = $1', [
        balanceBefore.rows[0]?.subscriber_id,
      ]);
      expect(account.rowCount).toBe(1);
      const billing = await admin.query(
        'SELECT 1 FROM control.plan_payments WHERE tenant_id = $1',
        [shop.tenantId],
      );
      expect(billing.rowCount).toBeGreaterThan(0);
      expect((await activity(shop.tenantId, 'tenant_deleted')).length).toBe(1);

      const again = await act(shop, 'delete-data', { confirmAddress: slug, reason: REASON });
      expect(again.status).toBe(409);
    },
    SLOW_MS,
  );

  it(
    'leaves a shop the operator brought back before the job ran',
    async () => {
      const shop = await shopOnPlan('brought-back');
      await seedPhase7(shop.tenantId);
      const { slug } = await shopRow(shop.tenantId);
      ok(await act(shop, 'delete-data', { confirmAddress: slug, reason: REASON }));
      ok(await act(shop, 'extend', { days: 5, reason: REASON }));
      expect((await shopRow(shop.tenantId)).state).toBe('active');

      await app.get(LifecycleService).eraseRequested(shop.tenantId);

      expect((await shopRow(shop.tenantId)).state).toBe('active');
      expect(await countsOf(shop.tenantId)).toEqual([1, 1, 1, 1, 1]);
    },
    SLOW_MS,
  );

  it(
    "keeps those tables' rows from being deleted any other way (0122's guard)",
    async () => {
      const shop = await openShop(port, texts, 'guarded');
      await seedPhase7(shop.tenantId);
      const tryDelete = async (erasing: boolean): Promise<string | null> => {
        await appDb.query('BEGIN');
        try {
          await appDb.query(`SELECT set_config('app.tenant_id', $1, true)`, [shop.tenantId]);
          if (erasing) {
            await appDb.query(`SELECT set_config('app.erasing_tenant', $1, true)`, [shop.tenantId]);
          }
          for (const table of PHASE_7) {
            await appDb.query(`DELETE FROM tenant.${table} WHERE tenant_id = $1`, [shop.tenantId]);
          }
          return null;
        } catch (error) {
          return (error as { constraint?: string }).constraint ?? String(error);
        } finally {
          await appDb.query('ROLLBACK');
        }
      };
      expect(await tryDelete(false)).toBe('deleted_only_with_shop');
      // Naming the shop isn't enough while it is live.
      expect(await tryDelete(true)).toBe('deleted_only_with_shop');
      await admin.query("UPDATE control.tenants SET state = 'archived' WHERE id = $1", [
        shop.tenantId,
      ]);
      expect(await tryDelete(false)).toBe('deleted_only_with_shop');
      expect(await tryDelete(true)).toBeNull();
      expect(await countsOf(shop.tenantId)).toEqual([1, 1, 1, 1, 1]);
    },
    SLOW_MS,
  );
});

describeIfDatabase('ADM-04, ADM-13: the operator alone', () => {
  it(
    'refuses anyone else, and a shop that is not one answers 404',
    async () => {
      const shop = await openShop(port, texts, 'guard');
      const bodies: [string, unknown][] = [
        ['extend', { days: 5, reason: REASON }],
        ['owner-reset', { phone: texts.freshPhone(), reason: REASON }],
        ['delete-data', { confirmAddress: 'x', reason: REASON }],
      ];
      for (const [path, body] of bodies) {
        const url = `/operator/tenants/${shop.tenantId}/${path}`;
        expect((await postJson(port, url, body)).status, path).toBe(401);
        expect((await shop.post(url, body)).status, path).toBe(401);
        for (const id of ['not-a-shop', randomUUID()]) {
          const answer = await postJson(port, `/operator/tenants/${id}/${path}`, body, operator);
          expect(answer.status, `${path} ${id}`).toBe(404);
        }
      }
    },
    SLOW_MS,
  );
});

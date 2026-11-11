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
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import {
  cookieFrom,
  deleteJson,
  getJson,
  patchJson,
  postJson,
  putJson,
  sendExact,
  type HttpResult,
} from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// OPERATOR-CONSOLE-DESIGN §15: what the rebuilt console reads that the older operator routes did not carry, over real
// HTTP and the real database. Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_operator_console_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SLOW_MS = 60_000;
const PASSWORD = 'correct-pw9';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let planId = '';
let termId = '';
const texts = new SmsCapture();
const storage = new MemoryStorage();

interface Operator {
  email: string;
  headers: Record<string, string>;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'console-reads-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  planId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ('Console plan', 960, true, $1) RETURNING id`,
        [JSON.stringify({ products: 100, staff: 2, storage_mb: 2048, bandwidth_gb: null })],
      )
    ).rows[0]?.id ?? '';
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', 'Console month', 1, true, 0) RETURNING id`,
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
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

async function signedInOperator(): Promise<Operator> {
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
  return {
    email,
    headers: {
      cookie: cookieFrom(enrolled),
      'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
    },
  };
}

/** A shop that bought the plan from its balance, so its plan has a version and its add-ons can be paid for. */
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

function ok(answer: HttpResult, status = 200): unknown {
  expect(answer.status, JSON.stringify(answer.body)).toBe(status);
  return answer.body;
}

interface OperatorShop {
  id: string;
  planName: string | null;
  planVersion: number | null;
  overrideCount: number;
  suspension: { at: string; reason: string | null; by: string | null } | null;
  paymentPageSuspension: { at: string; reason: string | null } | null;
  newShopCap: { set: boolean | null; holds: boolean };
}

describeIfDatabase('a shop for the operator (OPERATOR-CONSOLE-DESIGN §5)', () => {
  it(
    'reads one shop with its plan version, suspension, payment page and cap',
    async () => {
      const operator = await signedInOperator();
      const shop = await shopOnPlan('console-one');
      const route = `/operator/tenants/${shop.tenantId}`;

      const fresh = ok(await getJson(port, route, operator.headers)) as OperatorShop;
      expect(fresh).toMatchObject({
        id: shop.tenantId,
        planName: 'Console plan',
        overrideCount: 0,
        suspension: null,
        paymentPageSuspension: null,
        newShopCap: { set: null, holds: false },
      });
      expect(fresh.planVersion).toEqual(expect.any(Number));

      ok(
        await postJson(
          port,
          `${route}/suspend`,
          { reason: 'Counterfeit chargers reported' },
          operator.headers,
        ),
      );
      ok(
        await postJson(
          port,
          `${route}/payment-page/suspend`,
          { reason: 'Asked for a PIN' },
          operator.headers,
        ),
      );
      ok(
        await postJson(
          port,
          `${route}/new-shop-cap`,
          { capped: true, reason: 'Chargebacks reported' },
          operator.headers,
        ),
      );
      ok(
        await postJson(
          port,
          `/operator/tenants/${shop.tenantId}/limit-overrides`,
          { limitKey: 'products', value: 250, reason: 'Migration from the old shop' },
          operator.headers,
        ),
      );

      const read = ok(await getJson(port, route, operator.headers)) as OperatorShop;
      expect(read.suspension).toMatchObject({
        reason: 'Counterfeit chargers reported',
        by: operator.email,
      });
      expect(read.paymentPageSuspension).toMatchObject({ reason: 'Asked for a PIN' });
      expect(read.newShopCap).toEqual({ set: true, holds: true });
      expect(read.overrideCount).toBe(1);

      // Set off, the cap stops holding; back to null, it follows the shop's kind again.
      ok(
        await postJson(
          port,
          `${route}/new-shop-cap`,
          { capped: false, reason: 'A known seller' },
          operator.headers,
        ),
      );
      expect((ok(await getJson(port, route, operator.headers)) as OperatorShop).newShopCap).toEqual(
        { set: false, holds: false },
      );

      // The search's rows carry the version and the override count too.
      const found = ok(
        await getJson(
          port,
          `/operator/tenants?query=${encodeURIComponent(shop.slug)}`,
          operator.headers,
        ),
      ) as { entries: { id: string; planVersion: number | null; overrideCount: number }[] };
      expect(found.entries.find((entry) => entry.id === shop.tenantId)).toMatchObject({
        planVersion: fresh.planVersion,
        overrideCount: 1,
      });
    },
    SLOW_MS,
  );

  it(
    "says a pay-as-you-go shop's cap holds by its kind",
    async () => {
      const operator = await signedInOperator();
      const shop = await openShop(port, texts, 'console-payg');
      await admin.query(`UPDATE control.tenants SET state = 'pay_as_you_go' WHERE id = $1`, [
        shop.tenantId,
      ]);
      const read = ok(
        await getJson(port, `/operator/tenants/${shop.tenantId}`, operator.headers),
      ) as OperatorShop;
      expect(read.newShopCap).toEqual({ set: null, holds: true });
    },
    SLOW_MS,
  );

  it(
    "finds nothing for an unknown id or one that is not an id, and is the operator's alone",
    async () => {
      const operator = await signedInOperator();
      const shop = await openShop(port, texts, 'console-guard');
      for (const route of [
        `/operator/tenants/${randomUUID()}`,
        '/operator/tenants/not-an-id',
        `/operator/tenants/${randomUUID()}/addons`,
        '/operator/tenants/not-an-id/addons',
      ]) {
        expect((await getJson(port, route, operator.headers)).status, route).toBe(404);
      }
      for (const route of [
        `/operator/tenants/${shop.tenantId}`,
        `/operator/tenants/${shop.tenantId}/addons`,
        '/operator/recent-changes',
      ]) {
        expect((await getJson(port, route, {})).status, route).toBe(401);
        // A seller's own session is no way in.
        expect((await getJson(port, route, shop.headers())).status, route).toBe(401);
      }
    },
    SLOW_MS,
  );

  it(
    "reads a shop's add-ons and each limit's parts, with an override replacing the plan's value",
    async () => {
      const operator = await signedInOperator();
      const shop = await shopOnPlan('console-addons');
      const addon = (
        await admin.query<{ id: string }>(
          `SELECT id FROM control.addons WHERE key = 'extra_products'`,
        )
      ).rows[0]?.id;
      const quote = await shop.post('/addons/quote', { addonId: addon, quantity: 1 });
      const paymentId = (ok(quote, 201) as { payment: { id: string } }).payment.id;
      ok(await shop.post('/addons/purchase', { paymentId }), 201);
      ok(
        await postJson(
          port,
          `/operator/tenants/${shop.tenantId}/limit-overrides`,
          { limitKey: 'staff', value: 9, reason: 'Agreed for the migration' },
          operator.headers,
        ),
      );

      const read = ok(
        await getJson(port, `/operator/tenants/${shop.tenantId}/addons`, operator.headers),
      ) as {
        addons: { key: string; monthlyPrice: string; paidFrom: string; quantity: number }[];
        limits: {
          key: string;
          plan: unknown;
          overridden: boolean;
          override: unknown;
          addons: number;
          effective: unknown;
        }[];
      };
      expect(read.addons.find((item) => item.key === 'extra_products')).toMatchObject({
        quantity: 1,
        paidFrom: 'balance',
        monthlyPrice: expect.any(String) as string,
      });
      const limit = (key: string) => read.limits.find((part) => part.key === key);
      // The plan's 100, raised by the add-on's 500.
      expect(limit('products')).toEqual({
        key: 'products',
        plan: 100,
        overridden: false,
        override: null,
        addons: 500,
        effective: 600,
      });
      // The override replaces the plan's 2: it is not added to it.
      expect(limit('staff')).toEqual({
        key: 'staff',
        plan: 2,
        overridden: true,
        override: 9,
        addons: 0,
        effective: 9,
      });
      // Unlimited stays unlimited.
      expect(limit('bandwidth_gb')).toMatchObject({
        plan: null,
        overridden: false,
        effective: null,
      });
    },
    SLOW_MS,
  );
});

describeIfDatabase('who changed something, and why (ADM-11)', () => {
  it(
    'refuses a setting or a rate change with no reason, and keeps the reason on the audit log',
    async () => {
      const operator = await signedInOperator();
      const setting = '/operator/settings/trial_days';
      const rate = '/operator/rates/fraud_check';
      expect((await patchJson(port, setting, { value: 21 }, operator.headers)).status).toBe(400);
      expect(
        (await patchJson(port, setting, { value: 21, reason: '   ' }, operator.headers)).status,
      ).toBe(400);
      expect((await patchJson(port, rate, { value: 3 }, operator.headers)).status).toBe(400);

      ok(await patchJson(port, setting, { value: 21, reason: 'Eid offer' }, operator.headers));
      ok(await patchJson(port, rate, { value: 3, reason: 'Costs rose' }, operator.headers));

      const entries = await admin.query<{ action: string; summary: { reason: string } }>(
        `SELECT action, summary FROM control.platform_audit_log
         WHERE action IN ('settings_changed', 'rate_changed') AND summary->>'reason' IS NOT NULL
         ORDER BY id DESC LIMIT 2`,
      );
      expect(entries.rows.map((row) => [row.action, row.summary.reason])).toEqual([
        ['rate_changed', 'Costs rose'],
        ['settings_changed', 'Eid offer'],
      ]);

      const settings = ok(await getJson(port, '/operator/settings', operator.headers)) as {
        key: string;
        updatedByEmail: string | null;
      }[];
      expect(settings.find((row) => row.key === 'trial_days')?.updatedByEmail).toBe(operator.email);
      // A value no operator changed names nobody.
      expect(settings.find((row) => row.key === 'grace_days')?.updatedByEmail).toBeNull();

      const history = ok(
        await getJson(port, '/operator/rates/fraud_check/history', operator.headers),
      ) as { changedByEmail: string | null }[];
      expect(history[0]?.changedByEmail).toBe(operator.email);
    },
    SLOW_MS,
  );

  it(
    'refuses undoing a suspension, the cap or an override with no reason, and keeps the reason on both logs',
    async () => {
      const operator = await signedInOperator();
      const shop = await shopOnPlan('console-undo');
      const route = `/operator/tenants/${shop.tenantId}`;
      ok(await postJson(port, `${route}/suspend`, { reason: 'Fraud report' }, operator.headers));
      ok(
        await postJson(
          port,
          `${route}/payment-page/suspend`,
          { reason: 'PIN asked' },
          operator.headers,
        ),
      );
      ok(
        await postJson(
          port,
          `${route}/limit-overrides`,
          { limitKey: 'products', value: 300, reason: 'Agreed' },
          operator.headers,
        ),
      );
      // The removal is a DELETE: its reason is in the body, as DELETE /push/subscriptions takes its own.
      const removeOverride = (body: unknown) =>
        sendExact(
          port,
          'DELETE',
          `/api/v1${route}/limit-overrides/products`,
          body,
          operator.headers,
        );
      const undo = {
        restore: (body: unknown) => postJson(port, `${route}/restore`, body, operator.headers),
        pageRestore: (body: unknown) =>
          postJson(port, `${route}/payment-page/restore`, body, operator.headers),
        cap: (body: Record<string, unknown> | undefined) =>
          postJson(port, `${route}/new-shop-cap`, { capped: true, ...body }, operator.headers),
        removeOverride,
      };

      for (const body of [undefined, {}, { reason: '' }, { reason: '   ' }]) {
        for (const [name, call] of Object.entries(undo)) {
          expect((await call(body)).status, `${name} ${JSON.stringify(body)}`).toBe(400);
        }
      }
      // Refused, nothing was undone.
      const still = ok(await getJson(port, route, operator.headers)) as OperatorShop;
      expect(still.suspension).not.toBeNull();
      expect(still.paymentPageSuspension).not.toBeNull();
      expect(still.overrideCount).toBe(1);
      expect(still.newShopCap.set).toBeNull();

      ok(await undo.restore({ reason: 'The owner sent the invoices' }));
      ok(await undo.pageRestore({ reason: 'The page was fixed' }));
      ok(await undo.removeOverride({ reason: 'Migration finished' }));
      ok(await undo.cap({ reason: 'Chargebacks reported' }));

      const done = ok(await getJson(port, route, operator.headers)) as OperatorShop;
      expect(done).toMatchObject({
        suspension: null,
        paymentPageSuspension: null,
        overrideCount: 0,
        newShopCap: { set: true, holds: true },
      });
      const reasons = [
        ['tenant_restored', { reason: 'The owner sent the invoices' }],
        ['payment_page_restored', { reason: 'The page was fixed' }],
        ['plan_limit_override_removed', { limitKey: 'products', reason: 'Migration finished' }],
        ['new_shop_cap_set', { capped: true, reason: 'Chargebacks reported' }],
      ];
      const actions = reasons.map(([action]) => action);
      const platform = await admin.query<{ action: string; actor_id: string; summary: unknown }>(
        `SELECT action, actor_id, summary FROM control.platform_audit_log
         WHERE target_id = $1 AND action = ANY($2) ORDER BY id`,
        [shop.tenantId, actions],
      );
      expect(platform.rows.map((row) => [row.action, row.summary])).toEqual(reasons);
      const operatorId = platform.rows[0]?.actor_id;
      expect(platform.rows.every((row) => row.actor_id === operatorId)).toBe(true);
      // The shop's own log has each as Lytro support's, with the same reason.
      const activity = await admin.query<{ action: string; actor_type: string; summary: unknown }>(
        `SELECT action, actor_type, summary FROM tenant.activity_log
         WHERE tenant_id = $1 AND action = ANY($2) ORDER BY id`,
        [shop.tenantId, actions],
      );
      expect(activity.rows.map((row) => [row.action, row.summary])).toEqual(reasons);
      expect(activity.rows.every((row) => row.actor_type === 'platform_support')).toBe(true);
    },
    SLOW_MS,
  );

  it(
    'names who set an override',
    async () => {
      const operator = await signedInOperator();
      const shop = await shopOnPlan('console-who');
      const route = `/operator/tenants/${shop.tenantId}/limit-overrides`;
      ok(
        await postJson(
          port,
          route,
          { limitKey: 'products', value: 300, reason: 'Agreed' },
          operator.headers,
        ),
      );
      const listed = ok(await getJson(port, route, operator.headers)) as {
        setByEmail: string | null;
      }[];
      expect(listed[0]?.setByEmail).toBe(operator.email);
    },
    SLOW_MS,
  );

  it(
    "lists Today's recent changes, newest first, with the shop a suspension was of",
    async () => {
      const operator = await signedInOperator();
      const shop = await shopOnPlan('console-recent');
      ok(
        await patchJson(
          port,
          '/operator/settings/grace_days',
          { value: 5, reason: 'Longer grace' },
          operator.headers,
        ),
      );
      ok(
        await patchJson(
          port,
          '/operator/rates/ai_reply',
          { value: 2, reason: 'New price' },
          operator.headers,
        ),
      );
      ok(
        await postJson(
          port,
          `/operator/tenants/${shop.tenantId}/suspend`,
          { reason: 'Fraud report' },
          operator.headers,
        ),
      );
      ok(
        await postJson(
          port,
          `/operator/tenants/${shop.tenantId}/payment-page/suspend`,
          { reason: 'PIN asked' },
          operator.headers,
        ),
      );
      // Not a change this list is for.
      ok(
        await postJson(
          port,
          `/operator/tenants/${shop.tenantId}/new-shop-cap`,
          { capped: true, reason: 'Chargebacks reported' },
          operator.headers,
        ),
      );

      const changes = ok(await getJson(port, '/operator/recent-changes', operator.headers)) as {
        action: string;
        by: string | null;
        key: string | null;
        oldValue: unknown;
        newValue: unknown;
        reason: string | null;
        shop: { id: string; name: string; slug: string } | null;
      }[];
      expect(changes.slice(0, 4).map((change) => change.action)).toEqual([
        'payment_page_suspended',
        'tenant_suspended',
        'rate_changed',
        'settings_changed',
      ]);
      expect(changes.map((change) => change.action)).not.toContain('new_shop_cap_set');
      expect(changes.length).toBeLessThanOrEqual(6);
      expect(changes[1]).toMatchObject({
        by: operator.email,
        reason: 'Fraud report',
        shop: { id: shop.tenantId, slug: shop.slug },
      });
      expect(changes[2]).toMatchObject({
        by: operator.email,
        key: 'ai_reply',
        newValue: '2.00',
        reason: 'New price',
        shop: null,
      });
      expect(changes[3]).toMatchObject({ key: 'grace_days', newValue: 5, reason: 'Longer grace' });
    },
    SLOW_MS,
  );
});

describeIfDatabase('the queue says whose payment it is (ADM-06)', () => {
  it(
    'names the shop on each row, and the wallet once a receipt has seen the money',
    async () => {
      const operator = await signedInOperator();
      const shop = await openShop(port, texts, 'console-queue');
      const pay = async (transactionId: string): Promise<string> =>
        (
          await admin.query<{ id: string }>(
            `INSERT INTO control.plan_payments
               (tenant_id, kind, amount, credit_amount, quoted_at, status, sender_number, transaction_id, submitted_at)
             VALUES ($1, 'top_up', 500, 500, now(), 'pending', '01811998877', $2, now()) RETURNING id`,
            [shop.tenantId, transactionId],
          )
        ).rows[0]?.id ?? '';
      const seen = await pay('CONSOLESEEN1');
      const unseen = await pay('CONSOLEUNSEEN1');
      await admin.query(
        `INSERT INTO control.lytro_listener_messages
           (device_id, sender, method, transaction_id, amount, status, plan_payment_id, received_at)
         VALUES ($1, 'NAGAD', 'nagad', 'CONSOLESEEN1', 500, 'needs_review', $2, now())`,
        [randomUUID(), seen],
      );
      // A duplicate of a receipt says nothing about where this money landed.
      await admin.query(
        `INSERT INTO control.lytro_listener_messages
           (device_id, sender, method, transaction_id, amount, status, plan_payment_id, received_at)
         VALUES ($1, 'bKash', 'bkash', 'CONSOLEUNSEEN1', 500, 'duplicate', $2, now())`,
        [randomUUID(), unseen],
      );

      const rows = ok(await getJson(port, '/operator/payment-queue', operator.headers)) as {
        id: string;
        shopName: string;
        shopSlug: string;
        wallet: string | null;
      }[];
      expect(rows.filter((row) => row.id === seen)).toEqual([
        expect.objectContaining({ shopSlug: shop.slug, wallet: 'nagad' }),
      ]);
      expect(rows.filter((row) => row.id === unseen)).toEqual([
        expect.objectContaining({ shopSlug: shop.slug, wallet: null }),
      ]);
      expect(rows.find((row) => row.id === seen)?.shopName).toEqual(expect.any(String));
    },
    SLOW_MS,
  );
});

describeIfDatabase("a phone's installation is the operator's to read (LSN-21)", () => {
  it(
    "shows it on a shop's phones and Lytro's own, and never to the shop",
    async () => {
      const operator = await signedInOperator();
      const shop = await openShop(port, texts, 'console-phone');
      const install = `install-${randomUUID().slice(0, 8)}`;
      await admin.query(
        `INSERT INTO control.listener_devices (tenant_id, name, app_version, installation_id, token_hash)
         VALUES ($1, 'Counter phone', '1.0.0', $2, $3)`,
        [shop.tenantId, install, randomUUID().replace(/-/g, '').padEnd(64, 'a')],
      );
      const lytroInstall = `install-${randomUUID().slice(0, 8)}`;
      await admin.query(
        `INSERT INTO control.listener_devices (tenant_id, name, app_version, installation_id, token_hash)
         VALUES (NULL, 'Lytro phone', '1.0.0', $1, $2)`,
        [lytroInstall, randomUUID().replace(/-/g, '').padEnd(64, 'b')],
      );

      const forOperator = ok(
        await getJson(
          port,
          `/operator/tenants/${shop.tenantId}/listener-devices`,
          operator.headers,
        ),
      ) as { devices: { installationId?: string }[]; active: number };
      expect(forOperator.devices[0]?.installationId).toBe(install);
      expect(forOperator.active).toBe(1);

      const forLytro = ok(
        await getJson(port, '/operator/lytro-listener/devices', operator.headers),
      ) as { devices: { name: string; installationId?: string }[] };
      expect(forLytro.devices.find((device) => device.name === 'Lytro phone')?.installationId).toBe(
        lytroInstall,
      );

      const forShop = ok(await shop.get('/listener/devices')) as {
        devices: Record<string, unknown>[];
      };
      expect(forShop.devices.length).toBe(1);
      expect(forShop.devices[0]).not.toHaveProperty('installationId');

      // What the read gives is what blocking takes.
      const blocked = ok(
        await postJson(
          port,
          '/operator/listener-installations/block',
          { installationId: install, reason: 'Sent forged receipts' },
          operator.headers,
        ),
      ) as { revoked: number };
      expect(blocked.revoked).toBe(1);
    },
    SLOW_MS,
  );
});

describeIfDatabase('the sender list (LSN-16)', () => {
  it(
    'takes a list of senders, the only shape it holds, and refuses anything else',
    async () => {
      const operator = await signedInOperator();
      const path = '/operator/settings/listener_senders';
      const senders = ['bKash', 'NAGAD', 'upay', 'Rocket'];
      ok(await patchJson(port, path, { value: senders, reason: 'Added Rocket' }, operator.headers));
      const rows = ok(await getJson(port, '/operator/settings', operator.headers)) as {
        key: string;
        value: unknown;
      }[];
      expect(rows.find((row) => row.key === 'listener_senders')?.value).toEqual(senders);

      const words = await patchJson(
        port,
        path,
        { value: 'bKash', reason: 'Words' },
        operator.headers,
      );
      expect(words.status).toBe(400);
      const empty = await patchJson(port, path, { value: [], reason: 'None' }, operator.headers);
      expect(empty.status).toBe(400);
      // A list means nothing to any other setting.
      const number = await patchJson(
        port,
        '/operator/settings/trial_days',
        { value: ['30'], reason: 'A list' },
        operator.headers,
      );
      expect(number.status).toBe(400);
    },
    SLOW_MS,
  );
});

describeIfDatabase('what the pricing screens read (OPERATOR-CONSOLE-DESIGN §6, §6a, §7)', () => {
  interface PlanRow {
    id: string;
    shopsByVersion: { version: number; shops: number }[];
    deletable: boolean;
  }
  interface TermRow {
    id: string;
    invoices: number;
    deletable: boolean;
  }
  interface AddonRow {
    key: string;
    id: string;
    running: number;
    boughtThisMonth: number;
  }

  it(
    "counts the shops on each of a plan's versions, and says when it can no longer go (PLN-02, PLN-08)",
    async () => {
      const operator = await signedInOperator();
      const created = await postJson(
        port,
        '/operator/plans',
        { name: `Versions ${randomUUID().slice(0, 8)}`, rank: 8100, forSale: false, limits: {} },
        operator.headers,
      );
      const id = (ok(created, 201) as { id: string }).id;
      const read = async (): Promise<PlanRow | undefined> =>
        (ok(await getJson(port, '/operator/plans', operator.headers)) as PlanRow[]).find(
          (each) => each.id === id,
        );
      expect(await read()).toMatchObject({ shopsByVersion: [], deletable: true });

      const first = await openShop(port, texts, 'console-v1');
      const second = await openShop(port, texts, 'console-v2');
      const third = await openShop(port, texts, 'console-v2b');
      const place = (tenantId: string, version: number) =>
        admin.query(
          `UPDATE control.tenants SET plan_id = $1, plan_version_snapshot = $2 WHERE id = $3`,
          [id, version, tenantId],
        );
      await place(first.tenantId, 1);
      ok(await patchJson(port, `/operator/plans/${id}`, { rank: 8101 }, operator.headers));
      await place(second.tenantId, 2);
      await place(third.tenantId, 2);
      // A shop on another plan counts for that plan alone.
      const elsewhere = await openShop(port, texts, 'console-elsewhere');
      const otherPlan = ok(
        await postJson(
          port,
          '/operator/plans',
          { name: `Other ${randomUUID().slice(0, 8)}`, rank: 8102, forSale: false, limits: {} },
          operator.headers,
        ),
        201,
      ) as { id: string };
      await admin.query(
        `UPDATE control.tenants SET plan_id = $1, plan_version_snapshot = 1 WHERE id = $2`,
        [otherPlan.id, elsewhere.tenantId],
      );

      const after = await read();
      expect(after?.deletable).toBe(false);
      expect(after?.shopsByVersion).toEqual(
        expect.arrayContaining([
          { version: 1, shops: 1 },
          { version: 2, shops: 2 },
        ]),
      );
      expect(after?.shopsByVersion).toHaveLength(2);
    },
    SLOW_MS,
  );

  it(
    'a term stays while a price, a payment or a shop names it, and counts its invoices (TRM-05)',
    async () => {
      const operator = await signedInOperator();
      const term = ok(
        await postJson(
          port,
          '/operator/billing-terms',
          { labelBn: 'দুই মাস', labelEn: 'Two months', months: 2 },
          operator.headers,
        ),
        201,
      ) as { id: string };
      const read = async (): Promise<TermRow | undefined> =>
        (ok(await getJson(port, '/operator/billing-terms', operator.headers)) as TermRow[]).find(
          (each) => each.id === term.id,
        );
      expect(await read()).toMatchObject({ invoices: 0, deletable: true });

      // A price, read back with every other plan's from the one route the matrix uses.
      const plan = ok(
        await postJson(
          port,
          '/operator/plans',
          { name: `Priced ${randomUUID().slice(0, 8)}`, rank: 8200, forSale: false, limits: {} },
          operator.headers,
        ),
        201,
      ) as { id: string };
      ok(
        await putJson(
          port,
          `/operator/plans/${plan.id}/prices/${term.id}`,
          { price: 899 },
          operator.headers,
        ),
      );
      const prices = ok(
        await getJson(port, '/operator/billing-terms/prices', operator.headers),
      ) as { planId: string; billingTermId: string; price: string }[];
      expect(prices).toContainEqual({ planId: plan.id, billingTermId: term.id, price: '899.00' });
      expect((await read())?.deletable).toBe(false);
      await admin.query(`DELETE FROM control.plan_prices WHERE billing_term_id = $1`, [term.id]);
      expect((await read())?.deletable).toBe(true);

      // A shop's current period names it, with no foreign key to refuse the delete.
      const shop = await openShop(port, texts, 'console-term');
      await admin.query(`UPDATE control.tenants SET billing_term_id = $1 WHERE id = $2`, [
        term.id,
        shop.tenantId,
      ]);
      expect((await read())?.deletable).toBe(false);
      const whileHeld = await deleteJson(
        port,
        `/operator/billing-terms/${term.id}`,
        operator.headers,
      );
      expect(whileHeld.status).toBe(409);
      await admin.query(`UPDATE control.tenants SET billing_term_id = NULL WHERE id = $1`, [
        shop.tenantId,
      ]);
      expect((await read())?.deletable).toBe(true);

      // A payment names it, and its invoice counts.
      const payment = await admin.query<{ id: string }>(
        `INSERT INTO control.plan_payments (tenant_id, kind, billing_term_id, amount, status)
         VALUES ($1, 'purchase', $2, 899, 'verified') RETURNING id`,
        [shop.tenantId, term.id],
      );
      expect(await read()).toMatchObject({ invoices: 0, deletable: false });
      const afterPayment = await deleteJson(
        port,
        `/operator/billing-terms/${term.id}`,
        operator.headers,
      );
      expect(afterPayment.status).toBe(409);
      await admin.query(
        `INSERT INTO control.invoices (tenant_id, number, kind, amount, plan_payment_id)
         VALUES ($1, $2, 'purchase', 899, $3)`,
        [shop.tenantId, 8_000_000 + Math.floor(Math.random() * 900_000), payment.rows[0]?.id],
      );
      expect(await read()).toMatchObject({ invoices: 1, deletable: false });
    },
    SLOW_MS,
  );

  it(
    "counts what is running of each add-on now, and this month's packs (PLN-13)",
    async () => {
      const operator = await signedInOperator();
      const read = async (key: string): Promise<AddonRow> => {
        const rows = ok(await getJson(port, '/operator/addons', operator.headers)) as AddonRow[];
        const row = rows.find((each) => each.key === key);
        if (!row) throw new Error(`no add-on ${key}`);
        return row;
      };
      const seat = await read('extra_seat');
      const pack = await read('bandwidth_pack');
      const shop = await openShop(port, texts, 'console-addons');
      const bought = (
        addon: AddonRow,
        kind: string,
        quantity: number,
        status: string,
        startsAt: string,
        expiresAt: string,
        purchasedAt: string,
      ) =>
        admin.query(
          `INSERT INTO control.addon_purchases
             (tenant_id, addon_id, kind, quantity, price, status, paid_from, starts_at, expires_at, purchased_at)
           VALUES ($1, $2, $3, $4, 49, $5, 'balance',
                   now() + $6::interval, now() + $7::interval, now() + $8::interval)`,
          [shop.tenantId, addon.id, kind, quantity, status, startsAt, expiresAt, purchasedAt],
        );

      await bought(seat, 'limit', 2, 'active', '-1 day', '10 days', '-1 day');
      // None of these is running: ended, not paid, and the renewal that starts when this one ends.
      await bought(seat, 'limit', 4, 'active', '-40 days', '-1 day', '-40 days');
      await bought(seat, 'limit', 8, 'pending', '-1 day', '10 days', '-1 day');
      await bought(seat, 'limit', 16, 'active', '10 days', '40 days', '-1 day');
      await bought(pack, 'pack', 3, 'active', '-1 second', '300 days', '-1 second');
      await bought(pack, 'pack', 32, 'active', '-70 days', '300 days', '-70 days');
      await bought(pack, 'pack', 64, 'cancelled', '-1 second', '300 days', '-1 second');

      const seatAfter = await read('extra_seat');
      expect(seatAfter.running - seat.running).toBe(2);
      expect(seatAfter.boughtThisMonth).toBe(seat.boughtThisMonth);
      const packAfter = await read('bandwidth_pack');
      expect(packAfter.boughtThisMonth - pack.boughtThisMonth).toBe(3);
      expect(packAfter.running).toBe(pack.running);
    },
    SLOW_MS,
  );
});

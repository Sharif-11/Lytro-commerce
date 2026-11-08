import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType, OrderStatus, TenantState } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, postJson, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// ADM-02, ADM-03 (Phase 8 Slice 8.2, read agreed 2026-11-08): the operator's shop list and the shop page's figures,
// over real HTTP and the real database. Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_operator_shop_reads_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SLOW_MS = 60_000;
const PASSWORD = 'correct-pw9';
const DAY_MS = 24 * 60 * 60 * 1000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let planId = '';
let otherPlanId = '';
let termId = '';
let operator: Record<string, string> = {};
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'shop-reads-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  planId = await plan('Shop reads plan', 970);
  otherPlanId = await plan('Shop reads other plan', 971);
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', 'Shop reads month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  for (const id of [planId, otherPlanId]) {
    await admin.query(
      'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, 449)',
      [id, termId],
    );
  }
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  operator = await signedInOperator();
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

async function plan(name: string, rank: number): Promise<string> {
  return (
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ($1, $2, true, $3) RETURNING id`,
        [
          name,
          rank,
          JSON.stringify({ products: 100, staff: 3, storage_mb: 2048, bandwidth_gb: null }),
        ],
      )
    ).rows[0]?.id ?? ''
  );
}

async function signedInOperator(): Promise<Record<string, string>> {
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
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
}

/** A shop that bought this plan from its balance, so it has staff seats and a period end. */
async function shopOnPlan(prefix: string, plan = planId): Promise<ShopClient> {
  const shop = await openShop(port, texts, prefix);
  await app.get(BalanceService).creditStandalone({
    tenantId: shop.tenantId,
    amount: '5000.00',
    type: LedgerEntryType.TopUp,
  });
  const purchase = app.get(PurchaseService);
  const quote = await purchase.quote(shop.tenantId, plan, termId);
  await purchase.confirmFromBalance(quote.id, shop.tenantId);
  return shop;
}

async function ownerPhoneOf(tenantId: string): Promise<string> {
  const { rows } = await admin.query<{ value: string }>(
    `SELECT si.value FROM control.tenants t JOIN control.subscriber_identities si ON si.id = t.owner_identity_id
     WHERE t.id = $1`,
    [tenantId],
  );
  return rows[0]?.value ?? '';
}

/** A dine-in order of one line straight into the shop's tables, on today's date; delivered when `fulfillment` says so. */
async function seedOrder(
  tenantId: string,
  fulfillment: string,
  payment: string,
  total: number,
): Promise<string> {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO tenant.orders (id, tenant_id, order_number, tracking_id, fulfilment_type, table_ref,
       fulfillment_status, payment_status, confirmed_at, delivered_at, subtotal, delivery_charge, grand_total,
       cod_amount, due)
     VALUES ($1, $2, $3, $4, 'dine_in', 'T1', $5, $6, now(), $8, $7, 0, $7, $7, 0)`,
    [
      id,
      tenantId,
      `T-${id.slice(0, 8)}`,
      id
        .replace(/[^A-HJ-NP-Z2-9]/gi, '')
        .slice(0, 8)
        .toUpperCase()
        .padEnd(8, 'X'),
      fulfillment,
      payment,
      total,
      fulfillment === 'delivered' ? new Date() : null,
    ],
  );
  await admin.query(
    `INSERT INTO tenant.order_lines (tenant_id, order_id, position, product_name, stock_unit, list_price,
       unit_price, quantity, item_total, delivery_mode, delivery_charge, payment_policy)
     VALUES ($1, $2, 0, 'Seeded item', 'kg', $3, $3, 1, $3, 'default', 0, 'none')`,
    [tenantId, id, total],
  );
  return id;
}

function ok(answer: HttpResult, status = 200): unknown {
  expect(answer.status, JSON.stringify(answer.body)).toBe(status);
  return answer.body;
}

function asOperator(path: string): Promise<HttpResult> {
  return getJson(port, path, operator);
}

interface ListRow {
  id: string;
  shopName: string;
  state: TenantState;
  planId: string | null;
  periodEnd: string | null;
  ownerPhone: string | null;
}

interface ListPage {
  entries: ListRow[];
  nextCursor: string | null;
}

async function list(params: Record<string, string>): Promise<ListPage> {
  return ok(
    await asOperator(`/operator/tenants?${new URLSearchParams(params).toString()}`),
  ) as ListPage;
}

/** Every page of a list, following its cursor, so a sort's order can be read whole. */
async function everyPage(params: Record<string, string>): Promise<ListRow[]> {
  const rows: ListRow[] = [];
  let cursor: string | null = null;
  do {
    const page: ListPage = await list(cursor === null ? params : { ...params, cursor });
    rows.push(...page.entries);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return rows;
}

/** Renames a shop, so a test can find its own shops by a word no other test uses. */
async function rename(shop: ShopClient, name: string): Promise<void> {
  await admin.query('UPDATE control.tenants SET shop_name = $2 WHERE id = $1', [
    shop.tenantId,
    name,
  ]);
}

function token(): string {
  return `q${randomUUID()
    .replace(/[^a-f]/g, '')
    .slice(0, 6)}`;
}

describeIfDatabase('ADM-02: finding a shop', () => {
  it(
    "finds a shop by its owner's phone in any written form, or by its last 6 digits (D8-24)",
    async () => {
      const shop = await openShop(port, texts, 'phone');
      const phone = await ownerPhoneOf(shop.tenantId);
      const spaced = `+88 ${phone.slice(0, 5)} ${phone.slice(5)}`;
      const dashed = `${phone.slice(0, 5)}-${phone.slice(5)}`;
      for (const query of [phone, spaced, dashed, `88${phone}`]) {
        const found = await list({ query });
        expect(found.entries.map((row) => row.id)).toEqual([shop.tenantId]);
        expect(found.entries[0]?.ownerPhone).toBe(phone);
      }
      const ending = phone.slice(-6);
      const byEnding = await list({ query: ending, limit: '100' });
      expect(byEnding.entries.map((row) => row.id)).toContain(shop.tenantId);
      for (const row of byEnding.entries) {
        const named = row.shopName.toLowerCase().includes(ending);
        expect(named || row.ownerPhone?.endsWith(ending), row.shopName).toBe(true);
      }
      // Five digits aren't a phone search: only a name or an address holding them would match.
      const short = await list({ query: phone.slice(-5), limit: '100' });
      expect(short.entries.map((row) => row.id)).not.toContain(shop.tenantId);
    },
    SLOW_MS,
  );

  it(
    'filters by state and by plan, pay-as-you-go apart (PYG-13)',
    async () => {
      const word = token();
      const trial = await openShop(port, texts, 'state');
      const onPlan = await shopOnPlan('plan');
      const onOther = await shopOnPlan('other', otherPlanId);
      const payg = await openShop(port, texts, 'payg');
      for (const [shop, name] of [
        [trial, `${word} Trial`],
        [onPlan, `${word} Plan`],
        [onOther, `${word} Other`],
        [payg, `${word} Payg`],
      ] as const) {
        await rename(shop, name);
      }
      await admin.query("UPDATE control.tenants SET state = 'pay_as_you_go' WHERE id = $1", [
        payg.tenantId,
      ]);
      const ids = async (params: Record<string, string>): Promise<string[]> =>
        (await everyPage({ query: word, ...params })).map((row) => row.id).sort();
      expect(await ids({})).toEqual(
        [trial.tenantId, onPlan.tenantId, onOther.tenantId, payg.tenantId].sort(),
      );
      expect(await ids({ state: TenantState.PayAsYouGo })).toEqual([payg.tenantId]);
      expect(await ids({ state: TenantState.Trial })).toEqual([trial.tenantId]);
      expect(await ids({ planId })).toEqual([onPlan.tenantId]);
      expect(await ids({ planId: otherPlanId, state: TenantState.Active })).toEqual([
        onOther.tenantId,
      ]);
      expect((await asOperator('/operator/tenants?state=sleeping')).status).toBe(400);
    },
    SLOW_MS,
  );

  it(
    'sorts by name and by period end, every page in order with none twice; a link for another sort is refused',
    async () => {
      const word = token();
      // Names that tie once case is set aside, so a page can end inside a tie and the id must break it.
      const names = ['b', 'A', 'c', 'B', 'a'];
      const shops: ShopClient[] = [];
      for (const letter of names) {
        const shop = await openShop(port, texts, 'sort');
        await rename(shop, `${word} ${letter}`);
        shops.push(shop);
      }
      // Two with the same period end, two with none, one earlier: ties and the undated end break by id.
      const ends = ['2027-03-01', '2027-02-01', null, '2027-03-01', null];
      for (const [index, shop] of shops.entries()) {
        await admin.query('UPDATE control.tenants SET period_end = $2 WHERE id = $1', [
          shop.tenantId,
          ends[index] ?? null,
        ]);
      }
      const byName = await everyPage({ query: word, sort: 'name', limit: '1' });
      expect(new Set(byName.map((row) => row.id)).size).toBe(5);
      expect(byName.map((row) => row.shopName.slice(-1).toLowerCase())).toEqual([
        'a',
        'a',
        'b',
        'b',
        'c',
      ]);
      for (const pair of [byName.slice(0, 2), byName.slice(2, 4)]) {
        const ids = pair.map((row) => row.id);
        expect(ids).toEqual([...ids].sort());
      }

      const byEnd = await everyPage({ query: word, sort: 'period_end', limit: '2' });
      expect(new Set(byEnd.map((row) => row.id)).size).toBe(5);
      expect(byEnd.map((row) => row.periodEnd?.slice(0, 10) ?? null)).toEqual([
        '2027-02-01',
        '2027-03-01',
        '2027-03-01',
        null,
        null,
      ]);
      const tied = byEnd.slice(1, 3).map((row) => row.id);
      const undated = byEnd.slice(3).map((row) => row.id);
      expect(tied).toEqual([...tied].sort());
      expect(undated).toEqual([...undated].sort());

      const newest = await everyPage({ query: word, limit: '2' });
      expect(newest.map((row) => row.id)).toEqual(shops.map((shop) => shop.tenantId).reverse());

      // A link made for one order is refused by another, even where its key would read as a date there.
      const newestCursor = (await list({ query: word, limit: '1' })).nextCursor ?? '';
      const nameCursor = (await list({ query: word, sort: 'name', limit: '1' })).nextCursor ?? '';
      for (const [sort, cursor] of [
        ['period_end', newestCursor],
        ['period_end', nameCursor],
        ['name', newestCursor],
      ] as const) {
        const refused = await asOperator(
          `/operator/tenants?query=${word}&sort=${sort}&cursor=${cursor}`,
        );
        expect(refused.status, `${sort} with another sort's link`).toBe(400);
      }
    },
    SLOW_MS,
  );
});

interface Figures {
  balance: { amount: string; frozen: boolean; held: string };
  usage: Record<string, unknown>;
  errors: { since: string; count: number };
  failedSms: { since: string; shop: { failed: number; blocked: number }; lytro: number };
  failedCourierCalls: { since: string; count: number };
  signIns: {
    userId: string;
    name: string | null;
    phone: string | null;
    isOwner: boolean;
    lastAt: string | null;
  }[];
  paymentsWaiting: { lytro: { count: number; amount: string }; customers: number };
  orders: Record<OrderStatus, number>;
}

async function figuresOf(shop: ShopClient): Promise<Figures> {
  return ok(await asOperator(`/operator/tenants/${shop.tenantId}/figures`)) as Figures;
}

describeIfDatabase('ADM-03: the shop page', () => {
  it(
    'shows the balance and its frozen flag as the seller sees them',
    async () => {
      const shop = await openShop(port, texts, 'balance');
      await app.get(BalanceService).creditStandalone({
        tenantId: shop.tenantId,
        amount: '321.50',
        type: LedgerEntryType.TopUp,
      });
      await admin.query('UPDATE control.tenants SET balance_frozen = true WHERE id = $1', [
        shop.tenantId,
      ]);
      const seen = ok(await shop.get('/balance')) as { amount: string; frozen: boolean };
      const figures = await figuresOf(shop);
      expect(figures.balance.amount).toBe(seen.amount);
      expect(figures.balance.frozen).toBe(true);
      expect(seen.frozen).toBe(true);
    },
    SLOW_MS,
  );

  it(
    "counts the last 24 hours' server faults and lists the 7 days kept, newest first, never another shop's",
    async () => {
      const shop = await openShop(port, texts, 'errors');
      const other = await openShop(port, texts, 'errors-other');
      const now = Date.now();
      const fault = async (tenantId: string, id: string, ago: number): Promise<void> => {
        await admin.query(
          `INSERT INTO control.request_errors (tenant_id, request_id, method, route, status, kind, created_at)
           VALUES ($1, $2, 'GET', '/api/v1/orders/:id', 500, 'TypeError', $3)`,
          [tenantId, id, new Date(now - ago)],
        );
      };
      await fault(shop.tenantId, 'K7MQ-4XR2', 3 * DAY_MS);
      await fault(shop.tenantId, 'K7MQ-4XR3', 2 * 60 * 60 * 1000);
      await fault(shop.tenantId, 'K7MQ-4XR4', 60 * 1000);
      await fault(shop.tenantId, 'K7MQ-4XR5', 8 * DAY_MS);
      await fault(other.tenantId, 'K7MQ-4XR6', 60 * 1000);

      expect((await figuresOf(shop)).errors.count).toBe(2);
      const first = ok(await asOperator(`/operator/tenants/${shop.tenantId}/errors?limit=2`)) as {
        errors: { requestId: string; route: string; status: number; kind: string }[];
        nextBefore: number | null;
      };
      expect(first.errors.map((row) => row.requestId)).toEqual(['K7MQ-4XR4', 'K7MQ-4XR3']);
      expect(first.errors[0]).toMatchObject({
        route: '/api/v1/orders/:id',
        status: 500,
        kind: 'TypeError',
      });
      expect(first.errors[0]).not.toHaveProperty('message');
      const second = ok(
        await asOperator(
          `/operator/tenants/${shop.tenantId}/errors?limit=2&before=${String(first.nextBefore)}`,
        ),
      ) as { errors: { requestId: string }[]; nextBefore: number | null };
      expect(second.errors.map((row) => row.requestId)).toEqual(['K7MQ-4XR2']);
      expect(second.nextBefore).toBeNull();
    },
    SLOW_MS,
  );

  it(
    "shows each limit's use as the seller's usage page does, without its suggestions or packs (D8-31)",
    async () => {
      const shop = await shopOnPlan('usage');
      const seen = ok(await shop.get('/usage')) as Record<string, unknown>;
      const figures = await figuresOf(shop);
      expect(figures.usage).toEqual({
        cycleStart: seen['cycleStart'],
        cycleEnd: seen['cycleEnd'],
        metrics: seen['metrics'],
        payPerUse: seen['payPerUse'],
      });
      expect((figures.usage['metrics'] as unknown[]).length).toBeGreaterThan(0);
    },
    SLOW_MS,
  );

  it(
    "counts a week's SMS that didn't go, the shop's own and Lytro's, and lists them without a customer's phone or words",
    async () => {
      const shop = await openShop(port, texts, 'sms');
      const other = await openShop(port, texts, 'sms-other');
      const ownerPhone = await ownerPhoneOf(shop.tenantId);
      // D8-30: the shop's own "shop ready" now names it.
      const ready = await admin.query<{ tenant_id: string | null }>(
        "SELECT tenant_id FROM control.sms_outbox WHERE kind = 'shop_ready' AND to_phone = $1",
        [ownerPhone],
      );
      expect(ready.rows.map((row) => row.tenant_id)).toEqual([shop.tenantId]);

      const logged = async (status: string, ago: number): Promise<void> => {
        await admin.query(
          `INSERT INTO tenant.sms_log (tenant_id, kind, to_phone, units, cost, is_essential, status, blocked_reason,
             body, created_at)
           VALUES ($1, 'order_placed', '01799999999', 1, 0.35, false, $2, $3, 'Rahim, your order is placed', $4)`,
          [
            shop.tenantId,
            status,
            status === 'blocked' ? 'insufficient_balance' : null,
            new Date(Date.now() - ago),
          ],
        );
      };
      // In the order they happened, as the log keeps them.
      await logged('failed', 8 * DAY_MS);
      await logged('failed', 60 * 1000);
      await logged('blocked', 60 * 1000);
      await logged('sent', 60 * 1000);

      const outbox = async (
        tenantId: string | null,
        kind: string,
        phone: string,
        status: string,
        ago: number,
      ): Promise<void> => {
        await admin.query(
          `INSERT INTO control.sms_outbox (tenant_id, kind, to_phone, status, attempts, last_error, created_at)
           VALUES ($1, $2, $3, $4, 5, 'provider refused', $5)`,
          [tenantId, kind, phone, status, new Date(Date.now() - ago)],
        );
      };
      await outbox(shop.tenantId, 'lifecycle_notice', ownerPhone, 'failed', 8 * DAY_MS);
      await outbox(shop.tenantId, 'lifecycle_notice', ownerPhone, 'failed', 60 * 1000);
      // A sign-in code names a person, so it is the shop's by its team's phone.
      await outbox(null, 'otp', ownerPhone, 'failed', 60 * 1000);
      await outbox(null, 'otp', '01788888888', 'failed', 60 * 1000);
      await outbox(shop.tenantId, 'lifecycle_notice', ownerPhone, 'sent', 60 * 1000);
      await outbox(other.tenantId, 'lifecycle_notice', ownerPhone, 'failed', 60 * 1000);

      const figures = await figuresOf(shop);
      expect(figures.failedSms.shop).toEqual({ failed: 1, blocked: 1 });
      expect(figures.failedSms.lytro).toBe(2);

      const listed = ok(await asOperator(`/operator/tenants/${shop.tenantId}/failed-sms`)) as {
        shop: Record<string, unknown>[];
        lytro: { kind: string; toPhone: string; lastError: string | null }[];
      };
      expect(listed.shop.map((row) => row['status'])).toEqual(['blocked', 'failed', 'failed']);
      expect(listed.shop[0]).toMatchObject({ blockedReason: 'insufficient_balance', units: 1 });
      for (const row of listed.shop) {
        expect(row).not.toHaveProperty('toPhone');
        expect(row).not.toHaveProperty('body');
      }
      expect(listed.lytro.map((row) => row.kind).sort()).toEqual([
        'lifecycle_notice',
        'lifecycle_notice',
        'otp',
      ]);
      expect(listed.lytro.every((row) => row.toPhone === ownerPhone)).toBe(true);
      expect(listed.lytro[0]?.lastError).toBe('provider refused');

      const paged = ok(
        await asOperator(`/operator/tenants/${shop.tenantId}/failed-sms?limit=1`),
      ) as { shop: { id: number }[]; lytro: { id: number }[] };
      const next = ok(
        await asOperator(
          `/operator/tenants/${shop.tenantId}/failed-sms?limit=1&shopBefore=${String(paged.shop[0]?.id)}&lytroBefore=${String(paged.lytro[0]?.id)}`,
        ),
      ) as { shop: { id: number }[]; lytro: { id: number }[] };
      expect(next.shop[0]?.id).toBeLessThan(paged.shop[0]?.id ?? 0);
      expect(next.lytro[0]?.id).toBeLessThan(paged.lytro[0]?.id ?? 0);
    },
    SLOW_MS,
  );

  it(
    "counts a week's failed or refused courier calls, and the key log lists the failed ones alone (MON-05)",
    async () => {
      const shop = await openShop(port, texts, 'courier');
      const use = async (succeeded: boolean, ago: number): Promise<void> => {
        await admin.query(
          `INSERT INTO tenant.courier_credential_uses (tenant_id, courier_key, action, succeeded, at)
           VALUES ($1, 'steadfast', 'book', $2, $3)`,
          [shop.tenantId, succeeded, new Date(Date.now() - ago)],
        );
      };
      expect((await figuresOf(shop)).failedCourierCalls.count).toBe(0);
      await use(false, 1000);
      // Seen at once: the call's own log line is what the page counts.
      expect((await figuresOf(shop)).failedCourierCalls.count).toBe(1);
      await use(true, 1000);
      await use(false, 10 * DAY_MS);
      expect((await figuresOf(shop)).failedCourierCalls.count).toBe(1);
      const failed = ok(
        await asOperator(`/operator/tenants/${shop.tenantId}/courier-credential-uses?failed=true`),
      ) as { uses: { succeeded: boolean }[]; total: number };
      expect(failed.total).toBe(2);
      expect(failed.uses.every((row) => !row.succeeded)).toBe(true);
      const all = ok(
        await asOperator(`/operator/tenants/${shop.tenantId}/courier-credential-uses`),
      ) as { total: number };
      expect(all.total).toBe(3);
    },
    SLOW_MS,
  );

  it(
    "shows the owner's and each staff member's last sign-in, a code sign-in included (D8-27)",
    async () => {
      const shop = await shopOnPlan('signins');
      const staffPhone = texts.freshPhone();
      ok(
        await shop.post('/staff', { phone: staffPhone, password: 'staff-pw-9xx', name: 'Rina' }),
        201,
      );
      const before = await figuresOf(shop);
      expect(before.signIns.map((row) => row.isOwner)).toEqual([true, false]);
      expect(before.signIns[0]?.lastAt).not.toBeNull();
      expect(before.signIns[1]).toMatchObject({ name: 'Rina', phone: staffPhone, lastAt: null });

      await postJson(port, '/auth/phone/code', { phone: staffPhone }, { host: 'localhost' });
      ok(
        await postJson(
          port,
          '/auth/phone/verify',
          { phone: staffPhone, code: texts.codeFor(staffPhone) },
          { host: 'localhost' },
        ),
      );
      const after = await figuresOf(shop);
      expect(after.signIns[1]?.lastAt).not.toBeNull();
      expect(after.signIns[0]?.lastAt).toBe(before.signIns[0]?.lastAt);
    },
    SLOW_MS,
  );

  it(
    "lists the seller's payments to Lytro waiting for the operator, never another shop's (D8-28)",
    async () => {
      const shop = await openShop(port, texts, 'waiting');
      const other = await openShop(port, texts, 'waiting-other');
      const submit = async (tenantId: string, amount: string): Promise<void> => {
        await admin.query(
          `INSERT INTO control.plan_payments (tenant_id, kind, amount, status, transaction_id, submitted_at)
           VALUES ($1, 'top_up', $2, 'pending', $3, now())`,
          [tenantId, amount, `TX${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`],
        );
      };
      await submit(shop.tenantId, '500.00');
      await submit(shop.tenantId, '250.00');
      await submit(other.tenantId, '900.00');
      // A customer's typed transaction ID the seller hasn't checked yet.
      const order = await seedOrder(shop.tenantId, 'unfulfilled', 'pending_verification', 300);
      await admin.query(
        `INSERT INTO tenant.payment_sessions (tenant_id, ref, order_id, source, amount, expires_at, state, method,
           sender_number, transaction_id, submitted_at)
         VALUES ($1, $2, $3, 'checkout', 300, now() + interval '1 hour', 'checking', 'bkash', '01711111111', $4,
           now())`,
        [shop.tenantId, randomUUID().slice(0, 12), order, `CX${randomUUID().slice(0, 8)}`],
      );
      const figures = await figuresOf(shop);
      expect(figures.paymentsWaiting.lytro).toEqual({ count: 2, amount: '750.00' });
      const home = ok(await shop.get('/payments?status=to_verify&page=1&limit=1')) as {
        total: number;
      };
      expect(home.total).toBe(1);
      expect(figures.paymentsWaiting.customers).toBe(1);
      const waiting = ok(
        await asOperator(`/operator/tenants/${shop.tenantId}/payments-waiting`),
      ) as { tenantId: string; amount: string }[];
      expect(waiting.map((row) => row.amount).sort()).toEqual(['250.00', '500.00']);
      expect(waiting.every((row) => row.tenantId === shop.tenantId)).toBe(true);
    },
    SLOW_MS,
  );

  it(
    "counts the orders by the status the seller's list shows, and shows the seller's own sales without profit",
    async () => {
      const shop = await openShop(port, texts, 'orders');
      await seedOrder(shop.tenantId, 'delivered', 'paid', 400);
      await seedOrder(shop.tenantId, 'delivered', 'paid', 250);
      await seedOrder(shop.tenantId, 'unfulfilled', 'unverified', 100);
      const figures = await figuresOf(shop);
      for (const status of Object.values(OrderStatus)) {
        const seen = ok(await shop.get(`/orders?status=${status}&limit=1`)) as { total: number };
        expect(figures.orders[status], status).toBe(seen.total);
      }
      expect(Object.values(figures.orders).reduce((sum, count) => sum + count, 0)).toBe(3);

      // ADM-03: the same figures the seller reads for the same period, less the profit only they may see.
      type Figure = Record<string, unknown>;
      const withoutProfit = (figure: Figure): Figure =>
        Object.fromEntries(Object.entries(figure).filter(([key]) => key !== 'profit'));
      const query = 'bucket=month';
      const theirs = ok(await shop.get(`/sales?${query}`)) as Figure & {
        buckets: Figure[];
        totals: Figure;
      };
      const ours = ok(
        await asOperator(`/operator/tenants/${shop.tenantId}/sales?${query}`),
      ) as Figure & {
        buckets: Figure[];
        totals: Figure;
      };
      expect(theirs.totals).toHaveProperty('profit');
      expect(ours.totals).not.toHaveProperty('profit');
      expect(ours.totals['orders']).toBe(2);
      expect(ours).toEqual({
        ...theirs,
        buckets: theirs.buckets.map(withoutProfit),
        totals: withoutProfit(theirs.totals),
      });
    },
    SLOW_MS,
  );

  it(
    "is the operator's alone, and a shop that is not one answers 404",
    async () => {
      const shop = await openShop(port, texts, 'guard');
      for (const path of ['figures', 'errors', 'failed-sms', 'payments-waiting', 'sales']) {
        expect((await getJson(port, `/operator/tenants/${shop.tenantId}/${path}`)).status).toBe(
          401,
        );
        expect((await shop.get(`/operator/tenants/${shop.tenantId}/${path}`)).status).toBe(401);
        expect((await asOperator(`/operator/tenants/not-a-shop/${path}`)).status).toBe(404);
        expect((await asOperator(`/operator/tenants/${randomUUID()}/${path}`)).status).toBe(404);
      }
    },
    SLOW_MS,
  );
});

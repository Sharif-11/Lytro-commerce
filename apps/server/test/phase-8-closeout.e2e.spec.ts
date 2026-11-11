import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { InternalServerErrorException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LedgerEntryType, PlatformSettingKey, SmsKind } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { LifecycleService } from '../src/modules/billing/services/lifecycle.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { FraudChecks } from '../src/modules/fraud-checks/services/fraud-checks';
import { LytroPaymentPages } from '../src/modules/lytro-payments/services/lytro-payment-pages';
import { S3MediaStorage } from '../src/modules/media/providers/s3-media-storage';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { allowOrigin } from '../src/modules/public-api/services/cors';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { StaffService } from '../src/modules/staff/services/staff.service';
import { TenantService } from '../src/modules/tenancy/services/tenant.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, postJson, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 8's close-out (PHASE-8-PLAN §11, KNOWN-GAPS §144): what its three reviews found, each proven fixed here.
// - Review B F1: a shop's deletion, once begun, can't be undone, and a payment then is kept as its balance.
// - Review B F4: an extension isn't lost to a payment's activation or to the lifecycle tick, which hold its row lock.
// - Review B F5: the tick never moves a shop back along the lapse ladder, so it can't undo a request to delete.
// - Review B F3, F7, F8, S4, S6: a 5xx framework exception is kept; a deleted shop's shoppers' phones leave Lytro's
//   outbox; the shop list loses no shop at a page break; a second reset to one phone answers 409; a shop's website can
//   read the error ID.
// - Review A F2, S2: a bKash checkout in flight isn't closed by a manual entry; a screenshot not removed isn't called
//   removed.
// - D8-76 over D8-69 (the owner, 2026-11-11): a cleared help number takes its button off Lytro's payment page too.
// Runs only with DATABASE_TEST_ADMIN_URL (the last two parts need no database).
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_phase8_closeout_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 90_000, hookTimeout: 180_000 });

const PASSWORD = 'closeout-pass-8';
const DAY_MS = 24 * 60 * 60 * 1000;
const REASON = 'Asked by the owner on WhatsApp';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let planId = '';
let termId = '';
let walletId = '';
let operator: Record<string, string> = {};
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'closeout8-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  planId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ('Close-out plan', 981, true, $1) RETURNING id`,
        [JSON.stringify({ products: 100, staff: 3, storage_mb: 2048, bandwidth_gb: null })],
      )
    ).rows[0]?.id ?? '';
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', 'Close-out month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, 449)',
    [planId, termId],
  );
  walletId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.platform_wallets (provider, number) VALUES ('bkash', '01700000000') RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  const email = `closeout.${randomUUID().slice(0, 8)}@lytronix.internal`;
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

afterEach(() => {
  vi.restoreAllMocks();
});

/** A shop on the close-out plan, paid from its balance, with money left over. */
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

interface ShopRow {
  state: string;
  period_end: Date | null;
  deleted_at: Date | null;
  balance_amount: string;
  slug: string;
}

async function shopRow(tenantId: string): Promise<ShopRow> {
  const { rows } = await admin.query<ShopRow>(
    'SELECT state, period_end, deleted_at, balance_amount, slug FROM control.tenants WHERE id = $1',
    [tenantId],
  );
  if (!rows[0]) throw new Error('no such shop');
  return rows[0];
}

/** Waits for the shop's deletion to end, by whichever of the job and the test ran it. */
async function deletedSoon(tenantId: string): Promise<ShopRow> {
  for (let i = 0; i < 100; i += 1) {
    const row = await shopRow(tenantId);
    if (row.state === 'deleted') return row;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return shopRow(tenantId);
}

/** A renewal the seller quoted and says they paid by bKash, waiting in the operator's queue. */
async function submittedRenewal(shop: ShopClient): Promise<{ id: string; amount: string }> {
  const quote = await app.get(PurchaseService).quote(shop.tenantId, planId, termId);
  const paid = await shop.post('/billing/purchase', {
    paymentId: quote.id,
    method: 'wallet',
    transactionId: `TX${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    senderNumber: '01711111111',
    amountPaid: Number(quote.amount),
  });
  expect(paid.status, JSON.stringify(paid.envelope)).toBeLessThan(300);
  return { id: quote.id, amount: quote.amount };
}

/** A manual top-up for the shop, as the console sends it. */
function entryBody(tenantId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId,
    kind: 'top_up',
    amount: 300,
    amountConfirmation: 300,
    walletId,
    transactionId: `MAN${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
    senderNumber: '01712345678',
    paidAt: new Date(Date.now() - 3_600_000).toISOString(),
    evidenceLine: 'bKash statement line 7',
    reason: REASON,
    ...over,
  };
}

function approve(paymentId: string): Promise<HttpResult> {
  return postJson(port, `/operator/payment-queue/${paymentId}/approve`, {}, operator);
}

describeIfDatabase('a deletion, once begun, cannot be undone (review B F1, D8-37)', () => {
  it('refuses an extension sent while the job runs, and finishes the deletion', async () => {
    const shop = await shopOnPlan('erase');
    const staff = app.get(StaffService);
    const first = staff.deleteAllForTenant.bind(staff);
    let extendedMeanwhile: HttpResult | undefined;
    // The job's first step: by then the deletion has begun, under the shop's row lock.
    vi.spyOn(staff, 'deleteAllForTenant').mockImplementationOnce(async (tenant) => {
      extendedMeanwhile = await act(shop, 'extend', { days: 5, reason: REASON });
      return first(tenant);
    });
    const slug = (await shopRow(shop.tenantId)).slug;
    const requested = await act(shop, 'delete-data', { confirmAddress: slug, reason: REASON });
    expect(requested.status, JSON.stringify(requested.envelope)).toBeLessThan(300);
    await app.get(LifecycleService).eraseRequested(shop.tenantId);

    expect(extendedMeanwhile?.status, JSON.stringify(extendedMeanwhile?.envelope)).toBe(409);
    expect(JSON.stringify(extendedMeanwhile?.envelope)).toContain('ডিলিট হওয়া শুরু হয়ে গেছে');
    const after = await deletedSoon(shop.tenantId);
    expect(after.state).toBe('deleted');
    expect((await act(shop, 'extend', { days: 5, reason: REASON })).status).toBe(409);
  });

  it("keeps a plan payment approved for a shop being deleted as its balance, and doesn't bring it back", async () => {
    const shop = await shopOnPlan('erasepay');
    const renewal = await submittedRenewal(shop);
    const before = await shopRow(shop.tenantId);
    // The deletion has begun (its first step's mark) and stopped before its end.
    await admin.query(
      "UPDATE control.tenants SET state = 'archived', archived_at = now(), deleted_at = now() WHERE id = $1",
      [shop.tenantId],
    );
    const answer = await approve(renewal.id);
    expect(answer.status, JSON.stringify(answer.envelope)).toBeLessThan(300);

    const after = await shopRow(shop.tenantId);
    expect(after.state).toBe('archived');
    expect(after.period_end?.getTime()).toBe(before.period_end?.getTime());
    expect(Number(after.balance_amount)).toBeCloseTo(
      Number(before.balance_amount) + Number(renewal.amount),
      2,
    );
    const { rows } = await admin.query<{ kind: string; status: string }>(
      'SELECT kind, status FROM control.plan_payments WHERE id = $1',
      [renewal.id],
    );
    expect(rows[0]).toEqual({ kind: 'top_up', status: 'verified' });
  });
});

describeIfDatabase('a manual entry for a shop being deleted (D8-88)', () => {
  it('is refused, and nothing is recorded', async () => {
    const shop = await shopOnPlan('eraseentry');
    await admin.query(
      "UPDATE control.tenants SET state = 'archived', archived_at = now(), deleted_at = now() WHERE id = $1",
      [shop.tenantId],
    );
    const made = await postJson(
      port,
      '/operator/manual-entries',
      entryBody(shop.tenantId),
      operator,
    );
    expect(made.status, JSON.stringify(made.envelope)).toBe(409);
    const { rows } = await admin.query(
      'SELECT 1 FROM control.manual_payment_entries WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(rows).toHaveLength(0);
  });
});

describeIfDatabase(
  'an extension holds against a payment and the lifecycle tick (review B F4)',
  () => {
    it("isn't lost to a payment activated at the same moment: it waits, and extends the paid period", async () => {
      const shop = await shopOnPlan('race');
      const renewal = await submittedRenewal(shop);
      const tenants = app.get(TenantService);
      const write = tenants.applyPlanAssignment.bind(tenants);
      let extension: Promise<HttpResult> | undefined;
      // Between the renewal reading the shop and writing its new period, the operator extends it.
      vi.spyOn(tenants, 'applyPlanAssignment').mockImplementationOnce(async (...args) => {
        extension = act(shop, 'extend', { days: 5, reason: REASON });
        await new Promise((resolve) => setTimeout(resolve, 800));
        return write(...args);
      });
      expect((await approve(renewal.id)).status).toBeLessThan(300);
      const extended = await extension;
      expect(extended?.status, JSON.stringify(extended?.envelope)).toBe(200);

      // The extension worked from the renewed end, and nothing wrote over it.
      const to = new Date((extended?.body as { periodEnd: string }).periodEnd);
      expect((await shopRow(shop.tenantId)).period_end?.getTime()).toBe(to.getTime());
      expect(to.getTime()).toBeGreaterThan(Date.now() + 50 * DAY_MS);
    });

    it('leaves a shop the operator extended after the tick read it, instead of lapsing it further', async () => {
      const shop = await shopOnPlan('tick');
      await admin.query(
        `UPDATE control.tenants SET state = 'grace', period_end = $2, balance_frozen = false WHERE id = $1`,
        [shop.tenantId, new Date(Date.now() - 5 * DAY_MS)],
      );
      const tenants = app.get(TenantService);
      const read = tenants.findLapsingCandidates.bind(tenants);
      vi.spyOn(tenants, 'findLapsingCandidates').mockImplementationOnce(async (...args) => {
        const rows = await read(...args);
        const extended = await act(shop, 'extend', { days: 30, reason: REASON });
        expect(extended.status, JSON.stringify(extended.envelope)).toBe(200);
        return rows;
      });
      await app.get(LifecycleService).runTick(new Date());
      expect((await shopRow(shop.tenantId)).state).toBe('active');
    });
  },
);

describeIfDatabase('the tick never moves a shop back along the ladder (review B F5)', () => {
  it('keeps a lapsed shop whose data was asked to be deleted archived until its job runs', async () => {
    // The job is held back, so the tick meets the shop first.
    vi.spyOn(app.get(LifecycleService), 'eraseRequested').mockResolvedValue(undefined);
    const shop = await shopOnPlan('back');
    await admin.query(
      `UPDATE control.tenants SET state = 'grace', period_end = $2, lapse_schedule_snapshot = '{"grace":3,"readOnly":4,"locked":8,"archived":45}'
       WHERE id = $1`,
      [shop.tenantId, new Date(Date.now() - 2 * DAY_MS)],
    );
    const slug = (await shopRow(shop.tenantId)).slug;
    expect(
      (await act(shop, 'delete-data', { confirmAddress: slug, reason: REASON })).status,
    ).toBeLessThan(300);
    await app.get(LifecycleService).runTick(new Date());
    expect((await shopRow(shop.tenantId)).state).toBe('archived');
  });
});

describeIfDatabase("a deleted shop's shoppers' phones leave Lytro's outbox (review B F7)", () => {
  it("blanks each shopper's code row and stops one not sent, and keeps the owner's messages", async () => {
    const shop = await shopOnPlan('outbox');
    const insert = (phone: string, kind: string, status: string) =>
      admin.query(
        'INSERT INTO control.sms_outbox (to_phone, kind, tenant_id, status) VALUES ($1, $2, $3, $4)',
        [phone, kind, shop.tenantId, status],
      );
    await insert('01722220001', SmsKind.Otp, 'sent');
    await insert('01722220002', SmsKind.Otp, 'failed');
    await insert('01722220009', SmsKind.ShopReady, 'sent');
    const slug = (await shopRow(shop.tenantId)).slug;
    expect(
      (await act(shop, 'delete-data', { confirmAddress: slug, reason: REASON })).status,
    ).toBeLessThan(300);
    await app.get(LifecycleService).eraseRequested(shop.tenantId);
    expect((await deletedSoon(shop.tenantId)).state).toBe('deleted');

    const { rows } = await admin.query<{ to_phone: string; kind: SmsKind; status: string }>(
      'SELECT to_phone, kind, status FROM control.sms_outbox WHERE tenant_id = $1 ORDER BY id',
      [shop.tenantId],
    );
    const codes = rows.filter((row) => row.kind === SmsKind.Otp);
    expect(codes.length).toBeGreaterThanOrEqual(2);
    expect(codes.every((row) => row.to_phone === '' && row.status !== 'pending')).toBe(true);
    expect(
      rows.find((row) => row.kind === SmsKind.ShopReady && row.to_phone === '01722220009'),
    ).toBeDefined();
  });
});

describeIfDatabase(
  'a server fault raised as a framework exception is kept (review B F3, D8-22)',
  () => {
    it('answers 500 as a fault, and keeps it under the ID the seller is shown', async () => {
      const shop = await openShop(port, texts, 'fault');
      vi.spyOn(FraudChecks.prototype, 'rule').mockRejectedValue(new InternalServerErrorException());
      const answer = await shop.get('/fraud-checks/rule');
      expect(answer.status).toBe(500);
      expect(JSON.stringify(answer.envelope)).toContain('internal_error');
      const id = answer.headers['x-request-id'] as string;
      let kept: { tenant_id: string; status: number } | undefined;
      for (let i = 0; i < 40 && !kept; i += 1) {
        kept = (
          await admin.query<{ tenant_id: string; status: number }>(
            'SELECT tenant_id, status FROM control.request_errors WHERE request_id = $1',
            [id],
          )
        ).rows[0];
        if (!kept) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(kept).toEqual({ tenant_id: shop.tenantId, status: 500 });
    });
  },
);

describeIfDatabase('the shop list loses no shop at a page break (review B F8, D8-7)', () => {
  it('keeps two shops made in one millisecond on consecutive pages', async () => {
    const one = await openShop(port, texts, 'msone');
    const two = await openShop(port, texts, 'mstwo');
    await admin.query(
      "UPDATE control.tenants SET created_at = '2099-01-01T00:00:00.123456Z' WHERE id = $1",
      [one.tenantId],
    );
    await admin.query(
      "UPDATE control.tenants SET created_at = '2099-01-01T00:00:00.123400Z' WHERE id = $1",
      [two.tenantId],
    );
    const page = async (cursor?: string) =>
      (
        await getJson(
          port,
          `/operator/tenants?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
          operator,
        )
      ).body as { entries: { id: string }[]; nextCursor: string | null };
    const first = await page();
    const second = await page(first.nextCursor ?? '');
    expect([first.entries[0]?.id, second.entries[0]?.id].sort()).toEqual(
      [one.tenantId, two.tenantId].sort(),
    );
  });
});

describeIfDatabase('two resets to one new phone at once (review B S4)', () => {
  it('answers one and refuses the other as taken, never with a fault', async () => {
    const shop = await shopOnPlan('twice');
    const phone = `0171${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
    const answers = await Promise.all([
      act(shop, 'owner-reset', { phone, reason: REASON }),
      act(shop, 'owner-reset', { phone, reason: REASON }),
    ]);
    const statuses = answers.map((answer) => answer.status).sort();
    expect(
      statuses.every((status) => status < 500),
      JSON.stringify(statuses),
    ).toBe(true);
    expect(statuses).toContain(200);
  });
});

describeIfDatabase('a manual entry leaves a bKash checkout in flight open (review A F2)', () => {
  it("doesn't close the seller's payment while bKash may be taking its money", async () => {
    const shop = await shopOnPlan('flight');
    const quote = await app.get(PurchaseService).quote(shop.tenantId, planId, termId);
    await admin.query(
      "UPDATE control.plan_payments SET gateway_payment_id = 'TR0011closeout' WHERE id = $1",
      [quote.id],
    );
    const made = await postJson(
      port,
      '/operator/manual-entries',
      {
        tenantId: shop.tenantId,
        kind: 'plan',
        planId,
        billingTermId: termId,
        amount: 449,
        amountConfirmation: 449,
        walletId,
        transactionId: `MAN${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
        senderNumber: '01712345678',
        paidAt: new Date(Date.now() - 3_600_000).toISOString(),
        evidenceLine: 'bKash statement line 7',
        reason: REASON,
      },
      operator,
    );
    expect(made.status, JSON.stringify(made.envelope)).toBe(201);
    const { rows } = await admin.query<{ status: string }>(
      'SELECT status FROM control.plan_payments WHERE id = $1',
      [quote.id],
    );
    expect(rows[0]?.status).toBe('pending');
  });
});

describeIfDatabase(
  "a cleared help number leaves Lytro's payment page too (D8-76 over D8-69)",
  () => {
    it('shows Call alone when WhatsApp is cleared, with no stand-in', async () => {
      const settings = app.get(PlatformSettingsService);
      await settings.set(PlatformSettingKey.HelpPhone, '01700000099', randomUUID());
      await settings.set(PlatformSettingKey.HelpWhatsapp, '', randomUUID());
      const shop = await openShop(port, texts, 'helpline');
      const quote = await app.get(PurchaseService).quote(shop.tenantId, planId, termId);
      const ref = `pg${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      await admin.query('UPDATE control.plan_payments SET page_ref = $2 WHERE id = $1', [
        quote.id,
        ref,
      ]);
      const data = await app
        .get(LytroPaymentPages)
        .dataOf({ slug: 'lytro' }, ref, 'en', new Date());
      expect(data.shop).toMatchObject({ contactPhone: '01700000099', whatsapp: null });
    });
  },
);

describe("a shop's website can read a fault's error ID (review B S6, API-27)", () => {
  it('lists X-Request-Id among the headers a registered origin may read', () => {
    const headers = new Map<string, string>();
    allowOrigin(
      { setHeader: (name: string, value: string) => headers.set(name, value) },
      'https://shop.example',
    );
    expect(headers.get('Access-Control-Expose-Headers')).toContain('X-Request-Id');
  });
});

describe('a screenshot the store could not remove is not called removed (review A S2, D8-47)', () => {
  function storageWithAnswer(answer: unknown): S3MediaStorage {
    const key = { accessKeyId: 'test', secretAccessKey: 'test' };
    const made = new S3MediaStorage({
      endpoint: 'http://127.0.0.1:1',
      region: 'auto',
      pathStyle: true,
      uploadsBucket: 'uploads',
      mediaBucket: 'media',
      evidenceBucket: 'evidence',
      signer: key,
      processor: key,
      deleter: key,
    });
    const deleter = (
      made as unknown as { deleter: { send: (command: unknown) => Promise<unknown> } }
    ).deleter;
    vi.spyOn(deleter, 'send').mockResolvedValue(answer);
    return made;
  }

  it('fails the batch when the store names a file it kept', async () => {
    const store = storageWithAnswer({ Errors: [{ Key: 'evidence/a.jpg', Code: 'AccessDenied' }] });
    await expect(store.deleteEvidence(['evidence/a.jpg'])).rejects.toThrow();
  });

  it('passes when every file went', async () => {
    const store = storageWithAnswer({ Deleted: [{ Key: 'evidence/a.jpg' }] });
    await expect(store.deleteEvidence(['evidence/a.jpg'])).resolves.toBeUndefined();
  });
});

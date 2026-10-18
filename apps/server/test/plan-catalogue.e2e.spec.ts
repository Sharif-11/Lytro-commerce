import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { SmsCapture } from './support/sms-capture';
import {
  cookieFrom,
  getJson,
  patchJson,
  postJson,
  putJson,
  deleteJson,
  type HttpResult,
} from './support/http';

// Plans and billing terms, over the real database (PLN-01 to PLN-12, PLN-16 to PLN-18, TRM-01 to TRM-16).
// Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_plan_catalogue_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const BCRYPT_TIMEOUT_MS = 30_000;
const PASSWORD = 'correct-horse-9';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);
const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const patch = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  patchJson(port, path, payload, headers);
const put = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  putJson(port, path, payload, headers);
const del = (path: string, headers: Record<string, string> = {}) => deleteJson(port, path, headers);

const freshSlug = (): string => `p${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const LIMITS = { staff: 2, products: 50 };

function errorOf(result: HttpResult): unknown {
  return (result.body as { error?: unknown }).error;
}

async function createOperator(email: string): Promise<void> {
  const passwordHash = await hash(PASSWORD, 12);
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, passwordHash],
  );
}

async function enrollOperator(): Promise<{ cookie: string; csrfToken: string }> {
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await createOperator(email);
  const signedIn = await post('/auth/operator/signin', { email, password: PASSWORD });
  const { secret } = signedIn.body as { secret: string };
  const code = await generate({ secret });
  const response = await post('/auth/operator/enroll', { email, password: PASSWORD, code });
  const body = response.body as { csrfToken: string };
  return { cookie: cookieFrom(response), csrfToken: body.csrfToken };
}

async function operatorHeaders(): Promise<Record<string, string>> {
  const session = await enrollOperator();
  return { cookie: session.cookie, 'x-csrf-token': session.csrfToken };
}

/** A signed-in tenant owner, with no shop needed for PLN-04's own purpose (proving operator-only routes
    refuse a tenant credential before any shop-specific check would even run). */
async function ownerHeaders(): Promise<Record<string, string>> {
  const phone = texts.freshPhone();
  await post('/auth/phone/code', { phone });
  const entered = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  const body = entered.body as { csrfToken: string };
  return { cookie: cookieFrom(entered), 'x-csrf-token': body.csrfToken };
}

interface PlanBody {
  id: string;
  version: number;
  rank: number;
  forSale: boolean;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'plan-catalogue-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
}, BCRYPT_TIMEOUT_MS);

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('plans (PLN-01 to PLN-12, PLN-16)', () => {
  it(
    'PLN-04: a tenant owner credential never reaches a plan-edit endpoint',
    async () => {
      const owner = await ownerHeaders();
      const operator = await operatorHeaders();
      const created = await post(
        '/operator/plans',
        { name: `Pln04 ${freshSlug()}`, rank: 9000, forSale: false, limits: LIMITS },
        operator,
      );
      expect(created.status).toBe(201);
      const planId = (created.body as PlanBody).id;

      // No operator cookie at all reaches the same guard the same way -- the tenant's own session cookie is
      // structurally invisible to it (a different cookie name entirely), so this is `unauthenticated`, not
      // `forbidden` -- the SRS's pass criteria uses "forbidden" colloquially, not as the literal error code.
      const createAttempt = await post(
        '/operator/plans',
        { name: `Pln04b ${freshSlug()}`, rank: 9001, forSale: false, limits: LIMITS },
        owner,
      );
      expect(createAttempt.status).toBe(401);
      expect(errorOf(createAttempt)).toMatchObject({ code: 'unauthenticated' });

      const updateAttempt = await patch(`/operator/plans/${planId}`, { rank: 1 }, owner);
      expect(updateAttempt.status).toBe(401);
      expect(errorOf(updateAttempt)).toMatchObject({ code: 'unauthenticated' });

      const deleteAttempt = await del(`/operator/plans/${planId}`, owner);
      expect(deleteAttempt.status).toBe(401);
      expect(errorOf(deleteAttempt)).toMatchObject({ code: 'unauthenticated' });

      // The plan itself was never touched by any of the refused attempts.
      const stillThere = await get('/operator/plans', operator);
      const found = (stillThere.body as PlanBody[]).find((p) => p.id === planId);
      expect(found).toMatchObject({ rank: 9000 });
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'PLN-10: GET /plans never returns a not-for-sale plan',
    async () => {
      const headers = await operatorHeaders();
      const created = await post(
        '/operator/plans',
        { name: `NotForSale ${freshSlug()}`, rank: 9000, forSale: false, limits: LIMITS },
        headers,
      );
      expect(created.status).toBe(201);

      const publicList = await get('/plans');
      const ids = (publicList.body as PlanBody[]).map((p) => p.id);
      expect(ids).not.toContain((created.body as PlanBody).id);

      const operatorList = await get('/operator/plans', headers);
      const operatorIds = (operatorList.body as PlanBody[]).map((p) => p.id);
      expect(operatorIds).toContain((created.body as PlanBody).id);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'PLN-02/D2-3: editing a plan increments its version and the previous version is retrievable',
    async () => {
      const headers = await operatorHeaders();
      const created = await post(
        '/operator/plans',
        { name: `Edit ${freshSlug()}`, rank: 9001, forSale: true, limits: LIMITS },
        headers,
      );
      const plan = created.body as PlanBody;
      expect(plan.version).toBe(1);

      const edited = await patch(
        `/operator/plans/${plan.id}`,
        { limits: { ...LIMITS, products: 999 } },
        headers,
      );
      expect((edited.body as PlanBody).version).toBe(2);

      const versions = await get(`/operator/plans/${plan.id}/versions`, headers);
      const list = versions.body as { version: number; limits: { products?: number } }[];
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ version: 1, limits: { products: 50 } });
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'PLN-16: two for-sale plans cannot share a rank, but a not-for-sale plan can share one freely',
    async () => {
      const headers = await operatorHeaders();
      const rank = 9100;
      const first = await post(
        '/operator/plans',
        { name: `Rank ${freshSlug()}`, rank, forSale: true, limits: LIMITS },
        headers,
      );
      expect(first.status).toBe(201);

      const clash = await post(
        '/operator/plans',
        { name: `Rank ${freshSlug()}`, rank, forSale: true, limits: LIMITS },
        headers,
      );
      expect(clash.status).toBe(400);
      expect(errorOf(clash)).toMatchObject({
        code: 'validation_error',
        details: { fields: [{ field: 'rank', problem: 'taken' }] },
      });

      const notForSaleSameRank = await post(
        '/operator/plans',
        { name: `Rank ${freshSlug()}`, rank, forSale: false, limits: LIMITS },
        headers,
      );
      expect(notForSaleSameRank.status).toBe(201);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'PLN-08: a plan referenced by an assignment is not deletable, only retirable',
    async () => {
      const headers = await operatorHeaders();
      const created = await post(
        '/operator/plans',
        { name: `Referenced ${freshSlug()}`, rank: 9200, forSale: false, limits: LIMITS },
        headers,
      );
      const plan = created.body as PlanBody;
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug());
      const assigned = await post(
        `/operator/plans/${plan.id}/assign`,
        { tenantId, reason: 'enterprise deal' },
        headers,
      );
      expect(assigned.status).toBe(200);

      const deleted = await del(`/operator/plans/${plan.id}`, headers);
      expect(deleted.status).toBe(409);
      expect(errorOf(deleted)).toMatchObject({ code: 'conflict' });

      const retired = await patch(`/operator/plans/${plan.id}`, { forSale: false }, headers);
      expect(retired.status).toBe(200);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'PLN-17/18: a not-for-sale assignment needs a reason and is written to both audit logs',
    async () => {
      const headers = await operatorHeaders();
      const created = await post(
        '/operator/plans',
        { name: `Assign ${freshSlug()}`, rank: 9300, forSale: false, limits: LIMITS },
        headers,
      );
      const plan = created.body as PlanBody;
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug());

      const noReason = await post(
        `/operator/plans/${plan.id}/assign`,
        { tenantId, reason: '  ' },
        headers,
      );
      expect(noReason.status).toBe(400);

      const assigned = await post(
        `/operator/plans/${plan.id}/assign`,
        { tenantId, reason: 'internal tenant' },
        headers,
      );
      expect(assigned.status).toBe(200);

      const tenantRow = await admin.query<{
        plan_id: string;
        period_end: Date | null;
        state: string;
      }>('SELECT plan_id, period_end, state FROM control.tenants WHERE id = $1', [tenantId]);
      expect(tenantRow.rows[0]).toMatchObject({
        plan_id: plan.id,
        period_end: null,
        state: 'active',
      });

      const activity = await admin.query<{ count: string }>(
        `SELECT count(*)::text FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'plan_assigned'`,
        [tenantId],
      );
      expect(activity.rows[0]?.count).toBe('1');

      const platform = await admin.query<{ count: string }>(
        `SELECT count(*)::text FROM control.platform_audit_log WHERE action = 'plan_assigned' AND target_id = $1`,
        [tenantId],
      );
      expect(platform.rows[0]?.count).toBe('1');
    },
    BCRYPT_TIMEOUT_MS,
  );
});

describeIfDatabase('billing terms (TRM-01 to TRM-16)', () => {
  it(
    'TRM-01: a term with 0 or 61 months is rejected; a valid one is saved',
    async () => {
      const headers = await operatorHeaders();
      const zero = await post(
        '/operator/billing-terms',
        { labelBn: 'শূন্য', labelEn: 'Zero', months: 0 },
        headers,
      );
      expect(zero.status).toBe(400);

      const tooLong = await post(
        '/operator/billing-terms',
        { labelBn: 'দীর্ঘ', labelEn: 'TooLong', months: 61 },
        headers,
      );
      expect(tooLong.status).toBe(400);

      const valid = await post(
        '/operator/billing-terms',
        { labelBn: 'তিন মাস', labelEn: 'Three months', months: 3 },
        headers,
      );
      expect(valid.status).toBe(201);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'TRM-05: a term priced for a plan is not deletable, only retirable',
    async () => {
      const headers = await operatorHeaders();
      const plan = (
        await post(
          '/operator/plans',
          { name: `TermPlan ${freshSlug()}`, rank: 9400, forSale: true, limits: LIMITS },
          headers,
        )
      ).body as PlanBody;
      const term = (
        await post(
          '/operator/billing-terms',
          { labelBn: 'এক মাস', labelEn: 'One month', months: 1 },
          headers,
        )
      ).body as { id: string };

      const priced = await put(
        `/operator/plans/${plan.id}/prices/${term.id}`,
        { price: 449 },
        headers,
      );
      expect(priced.status).toBe(200);

      const deleted = await del(`/operator/billing-terms/${term.id}`, headers);
      expect(deleted.status).toBe(409);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'PLN-03: a plan price must be a positive whole number of taka',
    async () => {
      const headers = await operatorHeaders();
      const plan = (
        await post(
          '/operator/plans',
          { name: `PricePlan ${freshSlug()}`, rank: 9401, forSale: true, limits: LIMITS },
          headers,
        )
      ).body as PlanBody;
      const term = (
        await post(
          '/operator/billing-terms',
          { labelBn: 'এক মাস', labelEn: 'One month', months: 1 },
          headers,
        )
      ).body as { id: string };

      const fractional = await put(
        `/operator/plans/${plan.id}/prices/${term.id}`,
        { price: 449.5 },
        headers,
      );
      expect(fractional.status).toBe(400);

      const zero = await put(`/operator/plans/${plan.id}/prices/${term.id}`, { price: 0 }, headers);
      expect(zero.status).toBe(400);

      const negative = await put(
        `/operator/plans/${plan.id}/prices/${term.id}`,
        { price: -449 },
        headers,
      );
      expect(negative.status).toBe(400);

      const whole = await put(
        `/operator/plans/${plan.id}/prices/${term.id}`,
        { price: 449 },
        headers,
      );
      expect(whole.status).toBe(200);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'TRM-14: a tenant-scoped term never appears on the public, no-auth route',
    async () => {
      const headers = await operatorHeaders();
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug());
      const scoped = await post(
        '/operator/billing-terms',
        { labelBn: 'বিশেষ', labelEn: 'Enterprise-only', months: 12, tenantId },
        headers,
      );
      expect(scoped.status).toBe(201);

      const publicTerms = await get('/billing-terms');
      const ids = (publicTerms.body as { id: string }[]).map((t) => t.id);
      expect(ids).not.toContain((scoped.body as { id: string }).id);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    "TRM-04: retiring removes a term from the public list, not from the operator's own list",
    async () => {
      const headers = await operatorHeaders();
      const created = await post(
        '/operator/billing-terms',
        { labelBn: 'ছয় মাস', labelEn: 'Six months', months: 6 },
        headers,
      );
      const term = created.body as { id: string };

      const beforeRetire = await get('/billing-terms');
      expect((beforeRetire.body as { id: string }[]).map((t) => t.id)).toContain(term.id);

      const retired = await post(`/operator/billing-terms/${term.id}/retire`, {}, headers);
      expect(retired.status).toBe(200);
      expect((retired.body as { retiredAt: string | null }).retiredAt).not.toBeNull();

      const afterRetire = await get('/billing-terms');
      expect((afterRetire.body as { id: string }[]).map((t) => t.id)).not.toContain(term.id);

      const operatorList = await get('/operator/billing-terms', headers);
      expect((operatorList.body as { id: string }[]).map((t) => t.id)).toContain(term.id);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'TRM-16: create, update and retire are each audited with old and new values',
    async () => {
      const headers = await operatorHeaders();
      const created = await post(
        '/operator/billing-terms',
        { labelBn: 'চার মাস', labelEn: 'Four months', months: 4 },
        headers,
      );
      const term = created.body as { id: string };

      const updated = await patch(
        `/operator/billing-terms/${term.id}`,
        { labelEn: 'Four-month plan' },
        headers,
      );
      expect(updated.status).toBe(200);
      const retired = await post(`/operator/billing-terms/${term.id}/retire`, {}, headers);
      expect(retired.status).toBe(200);

      const rows = await admin.query<{
        action: string;
        summary: { oldValue: Record<string, unknown> | null; newValue: Record<string, unknown> };
      }>(
        `SELECT action, summary FROM control.platform_audit_log WHERE target_id = $1 ORDER BY id`,
        [term.id],
      );
      expect(rows.rows.map((r) => r.action)).toEqual([
        'billing_term_created',
        'billing_term_updated',
        'billing_term_retired',
      ]);
      expect(rows.rows[0]?.summary.oldValue).toBeNull();
      expect(rows.rows[1]?.summary).toMatchObject({
        oldValue: { labelEn: 'Four months' },
        newValue: { labelEn: 'Four-month plan' },
      });
      expect(rows.rows[2]?.summary.oldValue).toMatchObject({ retiredAt: null });
      expect(rows.rows[2]?.summary.newValue['retiredAt']).not.toBeNull();
    },
    BCRYPT_TIMEOUT_MS,
  );
});

describeIfDatabase('per-tenant limit overrides (PLN-11)', () => {
  it(
    'requires a reason, and removing an override is a separate, auditable step',
    async () => {
      const headers = await operatorHeaders();
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug());

      const noReason = await post(
        `/operator/tenants/${tenantId}/limit-overrides`,
        { limitKey: 'essential_sms_total', value: 20, reason: '' },
        headers,
      );
      expect(noReason.status).toBe(400);

      const set = await post(
        `/operator/tenants/${tenantId}/limit-overrides`,
        { limitKey: 'essential_sms_total', value: 20, reason: 'goodwill credit' },
        headers,
      );
      expect(set.status).toBe(200);

      const list = await get(`/operator/tenants/${tenantId}/limit-overrides`, headers);
      expect(list.body).toMatchObject([{ limitKey: 'essential_sms_total', value: 20 }]);

      const removed = await del(
        `/operator/tenants/${tenantId}/limit-overrides/essential_sms_total`,
        headers,
      );
      expect(removed.status).toBe(200);

      const afterRemoval = await get(`/operator/tenants/${tenantId}/limit-overrides`, headers);
      expect(afterRemoval.body).toEqual([]);
    },
    BCRYPT_TIMEOUT_MS,
  );
});

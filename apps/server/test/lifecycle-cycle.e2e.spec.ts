import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType, TenantState } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { UpgradeService } from '../src/modules/billing/services/upgrade.service';
import { LifecycleService } from '../src/modules/billing/services/lifecycle.service';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { SmsCapture } from './support/sms-capture';

// PHASE-2-PLAN.md exit criterion 5 (test id P2-E32 in PHASE-2-TEST-PLAN.md): the full cycle --
// BIL-11 (purchase after lapse) -> UPG-09 (upgrade) -> LIF-02 (non-renewal -> grace) -> LIF-19 (day-60
// deletion) -- for one tenant, one test, no manual steps. Each transition already has its own dedicated
// case elsewhere (plan-purchase.e2e.spec.ts, plan-upgrade.e2e.spec.ts, lifecycle.e2e.spec.ts); this proves
// they also compose correctly in sequence for the SAME tenant, which none of those files individually
// exercises. Same white-box pattern as all three: services called directly, a test clock simulated purely
// by backdating `period_end` (LifecycleService.deriveState is a pure function of days-lapsed).
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_lifecycle_cycle_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const DAY_MS = 24 * 60 * 60 * 1000;
// Default stage lengths (grace 3 + read-only 4 + locked 8 + archived 45 = 60), seeded by migration and
// unchanged by this suite -- 61 days clears all four with the same one-day margin the existing LIF-19 case
// already uses.
const DAYS_PAST_EVERY_LAPSE_STAGE = 61;

let app: INestApplication;
let admin: pg.Client;
let purchase: PurchaseService;
let upgrade: UpgradeService;
let lifecycle: LifecycleService;
let balance: BalanceService;
const texts = new SmsCapture();

const freshSlug = (): string => `t${randomUUID().replace(/-/g, '').slice(0, 10)}`;
let nextRank = 900000;

/** Seeds a plan at an explicit rank (upgrade needs target rank > current) with its own billing term/price. */
async function seedPlanAndTerm(
  rank: number,
  months: number,
  price: string,
): Promise<{ planId: string; termId: string }> {
  const plan = await admin.query<{ id: string }>(
    `INSERT INTO control.plans (name, rank, for_sale, version, limits, features)
     VALUES ($1, $2, true, 1, '{}', '{}') RETURNING id`,
    [`Test Plan ${freshSlug()}`, rank],
  );
  const term = await admin.query<{ id: string }>(
    `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
     VALUES ('মাস', $1, $2, true, 0) RETURNING id`,
    [`${months.toFixed(0)}-month`, months],
  );
  const planId = plan.rows[0]?.id ?? '';
  const termId = term.rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
    [planId, termId, price],
  );
  return { planId, termId };
}

async function tenantRow(tenantId: string) {
  const row = await admin.query<{
    state: TenantState;
    plan_id: string | null;
    period_start: Date | null;
    period_end: Date | null;
    deleted_at: Date | null;
  }>(
    'SELECT state, plan_id, period_start, period_end, deleted_at FROM control.tenants WHERE id = $1',
    [tenantId],
  );
  return row.rows[0];
}

async function backdatePeriodEnd(tenantId: string, daysAgo: number): Promise<void> {
  await admin.query('UPDATE control.tenants SET period_end = $1 WHERE id = $2', [
    new Date(Date.now() - daysAgo * DAY_MS),
    tenantId,
  ]);
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'lifecycle-cycle-e2e-otp-secret-0123456789a';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app } = await listenOn(moduleRef));
  purchase = app.get(PurchaseService);
  upgrade = app.get(UpgradeService);
  lifecycle = app.get(LifecycleService);
  balance = app.get(BalanceService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase(
  'PHASE-2-PLAN exit criterion 5 (P2-E32): one tenant through the whole phase',
  () => {
    it('BIL-11 -> UPG-09 -> LIF-02 -> LIF-19, end to end, no manual steps', async () => {
      const rank = (nextRank += 2);
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'grace');
      await balance.creditStandalone({ tenantId, amount: '10000.00', type: LedgerEntryType.TopUp });
      const { planId: starterId, termId: starterTermId } = await seedPlanAndTerm(rank, 1, '449.00');
      const { planId: growthId, termId: growthTermId } = await seedPlanAndTerm(
        rank + 1,
        1,
        '699.00',
      );

      // --- BIL-11: a tenant whose own plan already lapsed 5 days ago. Purchasing (renewing the same plan)
      // after the period ended restarts a full fresh period from confirmation time, not an extension. ---
      await admin.query('UPDATE control.tenants SET plan_id = $1 WHERE id = $2', [
        starterId,
        tenantId,
      ]);
      await backdatePeriodEnd(tenantId, 5);
      const beforePurchase = Date.now();
      const purchaseQuote = await purchase.quote(tenantId, starterId, starterTermId);
      await purchase.confirmFromBalance(purchaseQuote.id, tenantId);

      let tenant = await tenantRow(tenantId);
      expect(tenant?.state).toBe(TenantState.Active);
      expect(tenant?.plan_id).toBe(starterId);
      expect(new Date(tenant?.period_end ?? 0).getTime()).toBeGreaterThan(beforePurchase);

      // --- UPG-09: upgrading to Growth applies the new plan at once -- a new cycle, not an extension of the
      // one BIL-11 just started. ---
      const beforeUpgrade = Date.now();
      const upgradeQuote = await upgrade.quote(tenantId, growthId, growthTermId);
      await upgrade.confirmFromBalance(upgradeQuote.id, tenantId);

      tenant = await tenantRow(tenantId);
      expect(tenant?.state).toBe(TenantState.Active);
      expect(tenant?.plan_id).toBe(growthId);
      expect(new Date(tenant?.period_start ?? 0).getTime()).toBeGreaterThanOrEqual(beforeUpgrade);

      // --- LIF-02: no renewal. One day past the period UPG-09 just started, a tick moves the SAME tenant
      // straight into grace. ---
      await backdatePeriodEnd(tenantId, 1);
      await lifecycle.runTick(new Date());

      tenant = await tenantRow(tenantId);
      expect(tenant?.state).toBe(TenantState.Grace);

      // --- LIF-19: no payment ever arrives. 61 days past period end clears every lapse stage and the SAME
      // tenant's business data is deleted, in the same single-tick model every transition above already used.
      await backdatePeriodEnd(tenantId, DAYS_PAST_EVERY_LAPSE_STAGE);
      await lifecycle.runTick(new Date());

      tenant = await tenantRow(tenantId);
      expect(tenant?.state).toBe(TenantState.Deleted);
      expect(tenant?.deleted_at).not.toBeNull();

      // A second tick is a no-op -- the whole cycle needed no manual step at any point, including this one.
      await lifecycle.runTick(new Date());
      const after = await tenantRow(tenantId);
      expect(after?.deleted_at?.getTime()).toBe(tenant?.deleted_at?.getTime());
    });
  },
);

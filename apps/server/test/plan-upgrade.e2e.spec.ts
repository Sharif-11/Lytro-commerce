import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction, LedgerEntryType, PlanPaymentStatus } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { addMonths } from '../src/common/time';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { UpgradeService } from '../src/modules/billing/services/upgrade.service';
import { PaymentQueueService } from '../src/modules/billing/services/payment-queue.service';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { SmsCapture } from './support/sms-capture';

// Phase 2 slice 5: upgrade (UPG-01 to UPG-17). Same white-box pattern slices 3/4 used -- services are called
// directly, not through HTTP; this slice's own risk is the proration math and the period/invoice/audit side
// effects, not request plumbing (already covered elsewhere).
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_plan_upgrade_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const DAY_MS = 24 * 60 * 60 * 1000;

let app: INestApplication;
let admin: pg.Client;
let purchase: PurchaseService;
let upgrade: UpgradeService;
let queue: PaymentQueueService;
let balance: BalanceService;
const texts = new SmsCapture();

const freshSlug = (): string => `t${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const operatorId = (): string => randomUUID();
let nextRank = 500000;

/** Seeds a plan at an explicit rank (for UPG-02's ordering) with its own 1-off billing term and price. */
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
    state: string;
    plan_id: string | null;
    period_start: Date | null;
    period_end: Date | null;
    balance_amount: string;
  }>(
    'SELECT state, plan_id, period_start, period_end, balance_amount FROM control.tenants WHERE id = $1',
    [tenantId],
  );
  return row.rows[0];
}

/** Puts a tenant on a plan it genuinely purchased (a real invoice at `pricePaid`), then backdates the
 * period to an exact `totalDays` span with `remainingDays` left -- decoupled from the real calendar, so the
 * proration math matches the SRS worked examples exactly regardless of what day the suite runs. */
async function seedRunningPlan(
  tenantId: string,
  planId: string,
  termId: string,
  pricePaid: string,
  totalDays: number,
  remainingDays: number,
): Promise<void> {
  const quote = await purchase.quote(tenantId, planId, termId);
  expect(quote.amount).toBe(pricePaid);
  await purchase.confirmFromBalance(quote.id, tenantId);

  const periodEnd = new Date(Date.now() + remainingDays * DAY_MS);
  const periodStart = new Date(periodEnd.getTime() - totalDays * DAY_MS);
  await admin.query('UPDATE control.tenants SET period_start = $1, period_end = $2 WHERE id = $3', [
    periodStart,
    periodEnd,
    tenantId,
  ]);
  // UPG-03 (KNOWN-GAPS §84): the credit is the unused part of the period the invoice paid for, so it moves too.
  await admin.query(
    'UPDATE control.invoices SET period_start = $1, period_end = $2 WHERE tenant_id = $3',
    [periodStart, periodEnd, tenantId],
  );
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'plan-upgrade-e2e-otp-secret-0123456789ab';
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
  queue = app.get(PaymentQueueService);
  balance = app.get(BalanceService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** A funded, Starter-1-month tenant with 20 of 30 days remaining -- the SRS's Example A. */
async function seedExampleA(): Promise<{
  tenantId: string;
  growthId: string;
  growthTermId: string;
}> {
  const rank = (nextRank += 2);
  const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
  await balance.creditStandalone({ tenantId, amount: '10000.00', type: LedgerEntryType.TopUp });
  const { planId: starterId, termId: starterTermId } = await seedPlanAndTerm(rank, 1, '449.00');
  await seedRunningPlan(tenantId, starterId, starterTermId, '449.00', 30, 20);
  const { planId: growthId, termId: growthTermId } = await seedPlanAndTerm(rank + 1, 1, '699.00');
  return { tenantId, growthId, growthTermId };
}

describeIfDatabase('upgrade proration math, literally (UPG-02 to UPG-05)', () => {
  it('Example A: Starter 1-month (449, 30d) with 20d left upgrading to Growth 1-month (699)', async () => {
    const { tenantId, growthId, growthTermId } = await seedExampleA();
    const quote = await upgrade.quote(tenantId, growthId, growthTermId);
    expect(quote.creditAmount).toBe('299.00');
    expect(quote.amount).toBe('400.00');
  });

  it('Example B: Starter 12-month (4,741, 365d) with 265d left upgrading to Growth 12-month (7,381)', async () => {
    const rank = (nextRank += 2);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await balance.creditStandalone({ tenantId, amount: '20000.00', type: LedgerEntryType.TopUp });
    const { planId: starterId, termId: starterTermId } = await seedPlanAndTerm(rank, 12, '4741.00');
    await seedRunningPlan(tenantId, starterId, starterTermId, '4741.00', 365, 265);
    const { planId: growthId, termId: growthTermId } = await seedPlanAndTerm(
      rank + 1,
      12,
      '7381.00',
    );

    const quote = await upgrade.quote(tenantId, growthId, growthTermId);
    expect(quote.creditAmount).toBe('3442.00');
    expect(quote.amount).toBe('3939.00');
  });

  it('UPG-02: refuses an equal-rank target (the same plan)', async () => {
    const rank = (nextRank += 2);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await balance.creditStandalone({ tenantId, amount: '10000.00', type: LedgerEntryType.TopUp });
    const { planId: starterId, termId: starterTermId } = await seedPlanAndTerm(rank, 1, '449.00');
    await seedRunningPlan(tenantId, starterId, starterTermId, '449.00', 30, 20);

    // "Upgrading" to the plan already held is the same rank -- never a valid upgrade target.
    await expect(upgrade.quote(tenantId, starterId, starterTermId)).rejects.toMatchObject({
      code: 'validation_error',
    });
  });

  it('UPG-05: refuses a target whose price does not exceed the computed credit', async () => {
    const { tenantId } = await seedExampleA();
    const rank = (nextRank += 2);
    const { planId: tooCheapId, termId } = await seedPlanAndTerm(rank, 1, '250.00'); // credit is 299
    await expect(upgrade.quote(tenantId, tooCheapId, termId)).rejects.toMatchObject({
      code: 'validation_error',
    });
  });

  it('UPG-08: one open upgrade per tenant -- a new request replaces an unsent one, a submitted one blocks', async () => {
    const { tenantId, growthId, growthTermId } = await seedExampleA();
    const unsent = await upgrade.quote(tenantId, growthId, growthTermId);
    // BIL-19: nothing was sent for it, so the next request closes it rather than being refused (the deadlock of a
    // quote too old to pay from the balance and still counted as pending is gone).
    const sent = await upgrade.quote(tenantId, growthId, growthTermId);
    const closed = await admin.query<{ status: string; cancel_reason: string }>(
      'SELECT status, cancel_reason FROM control.plan_payments WHERE id = $1',
      [unsent.id],
    );
    expect(closed.rows[0]).toEqual({ status: 'cancelled', cancel_reason: 'replaced' });

    await upgrade.submitWalletPayment(sent.id, tenantId, {
      transactionId: `TXN-${randomUUID()}`,
      senderNumber: '01710000000',
      amountPaid: sent.amount,
    });
    await expect(upgrade.quote(tenantId, growthId, growthTermId)).rejects.toMatchObject({
      code: 'conflict',
      messageKey: 'UpgradePending',
    });
  });

  it('UPG-08: two upgrade requests at once leave one open, held by the database', async () => {
    const { tenantId, growthId, growthTermId } = await seedExampleA();
    await Promise.allSettled([
      upgrade.quote(tenantId, growthId, growthTermId),
      upgrade.quote(tenantId, growthId, growthTermId),
      upgrade.quote(tenantId, growthId, growthTermId),
    ]);
    const open = await admin.query<{ open: number }>(
      `SELECT count(*)::int AS open FROM control.plan_payments
       WHERE tenant_id = $1 AND kind = 'upgrade' AND status IN ('pending', 'needs_review')`,
      [tenantId],
    );
    expect(open.rows[0]?.open).toBe(1);
  });

  it('UPG-01: unavailable to a trial tenant', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const rank = (nextRank += 2);
    const { planId, termId } = await seedPlanAndTerm(rank, 1, '699.00');
    await expect(upgrade.quote(tenantId, planId, termId)).rejects.toMatchObject({
      code: 'plan_feature_unavailable',
    });
  });

  it('TRM-04: a retired term is refused as an upgrade target, same as a new purchase', async () => {
    const { tenantId, growthId, growthTermId } = await seedExampleA();
    await admin.query('UPDATE control.billing_terms SET retired_at = now() WHERE id = $1', [
      growthTermId,
    ]);
    await expect(upgrade.quote(tenantId, growthId, growthTermId)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describeIfDatabase('confirming an upgrade (UPG-09, UPG-12, UPG-15 to UPG-17)', () => {
  it('UPG-16/09/12/15: paying from balance deducts once, restarts the cycle, issues the invoice', async () => {
    const { tenantId, growthId, growthTermId } = await seedExampleA();
    const before = await balance.current(tenantId);

    const quote = await upgrade.quote(tenantId, growthId, growthTermId);
    const beforeConfirm = Date.now();
    const result = await upgrade.confirmFromBalance(quote.id, tenantId);

    expect(result.payment.status).toBe(PlanPaymentStatus.Verified);
    expect(result.invoice?.amount).toBe('400.00');
    expect(result.invoice?.creditAmount).toBe('299.00');

    const after = await balance.current(tenantId);
    expect((Number(before.amount) - Number(after.amount)).toFixed(2)).toBe('400.00');

    const tenant = await tenantRow(tenantId);
    expect(tenant?.plan_id).toBe(growthId);
    expect(new Date(tenant?.period_start ?? 0).getTime()).toBeGreaterThanOrEqual(beforeConfirm);
    // TRM-09: one month on the Dhaka calendar, clamped to a shorter month's last day -- as the server counts it.
    const expectedEnd = addMonths(new Date(tenant?.period_start ?? 0), 1);
    expect(new Date(tenant?.period_end ?? 0).getTime()).toBe(expectedEnd.getTime());

    const log = await admin.query<{ summary: { oldPlanId: string; newPlanId: string } }>(
      'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
      [tenantId, AuditAction.PlanUpgraded],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]?.summary.newPlanId).toBe(growthId);
  });

  it('UPG-16: paying by wallet leaves the balance unchanged until an operator approves it', async () => {
    const { tenantId, growthId, growthTermId } = await seedExampleA();
    const before = await balance.current(tenantId);

    const quote = await upgrade.quote(tenantId, growthId, growthTermId);
    await upgrade.submitWalletPayment(quote.id, tenantId, {
      transactionId: `TXN-${randomUUID()}`,
      senderNumber: '01710000000',
      amountPaid: '400.00',
    });

    const midway = await balance.current(tenantId);
    expect(midway.amount).toBe(before.amount);

    const approved = await queue.approve(quote.id, operatorId());
    expect(approved.status).toBe(PlanPaymentStatus.Verified);

    const after = await balance.current(tenantId);
    expect(after.amount).toBe(before.amount); // UPG-16: the balance never moves for the wallet path
    const tenant = await tenantRow(tenantId);
    expect(tenant?.plan_id).toBe(growthId);
  });

  it('UPG-17: an unconfirmed upgrade leaves the tenant on the old plan with nothing changed', async () => {
    const { tenantId, growthId, growthTermId } = await seedExampleA();
    const before = await tenantRow(tenantId);

    await upgrade.quote(tenantId, growthId, growthTermId);

    const after = await tenantRow(tenantId);
    expect(after?.plan_id).toBe(before?.plan_id);
    expect(after?.period_end?.getTime()).toBe(before?.period_end?.getTime());
    expect(after?.balance_amount).toBe(before?.balance_amount);
  });
});

describeIfDatabase('tenant isolation (SEC-02)', () => {
  it("another shop's upgrade payment id answers not_found", async () => {
    const { tenantId, growthId, growthTermId } = await seedExampleA();
    const intruder = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');

    const quote = await upgrade.quote(tenantId, growthId, growthTermId);
    await expect(upgrade.confirmFromBalance(quote.id, intruder)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

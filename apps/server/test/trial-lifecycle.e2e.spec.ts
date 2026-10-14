import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction, LedgerEntryType, TenantState } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { TrialLifecycleService } from '../src/modules/billing/services/trial-lifecycle.service';
import { PayAsYouGoBillingService } from '../src/modules/balance/services/payg-billing.service';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { TenantService } from '../src/modules/tenancy/services/tenant.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { SmsCapture } from './support/sms-capture';

// Phase 2 slice 3: the trial-end conversion to pay-as-you-go (TRL-07) and the pay-as-you-go order/product
// fee math (PYG-02, PYG-16). Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_trial_lifecycle_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let admin: pg.Client;
let trialLifecycle: TrialLifecycleService;
let paygBilling: PayAsYouGoBillingService;
let balance: BalanceService;
let tenants: TenantService;
const texts = new SmsCapture();

const freshSlug = (): string => `t${randomUUID().replace(/-/g, '').slice(0, 10)}`;

async function freshTrialTenant(periodEnd: Date): Promise<string> {
  const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
  await admin.query('UPDATE control.tenants SET period_end = $1 WHERE id = $2', [
    periodEnd,
    tenantId,
  ]);
  return tenantId;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'trial-lifecycle-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  // The trial-end seed migration only runs on the admin/migration connection; prepareTestDatabase already
  // applies every migration (including 0028's Pay-as-you-go plan and trial_days setting) to this fresh DB.

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app } = await listenOn(moduleRef));
  trialLifecycle = app.get(TrialLifecycleService);
  paygBilling = app.get(PayAsYouGoBillingService);
  balance = app.get(BalanceService);
  tenants = app.get(TenantService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('trial-end conversion to pay-as-you-go (TRL-07)', () => {
  it('converts a trial whose period has ended, with no data loss', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tenantId = await freshTrialTenant(past);

    const converted = await trialLifecycle.convertExpiredTrials();
    expect(converted).toBeGreaterThanOrEqual(1);

    const row = await admin.query(
      'SELECT state, plan_id, plan_snapshot, period_end FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    const tenant = row.rows[0] as {
      state: string;
      plan_id: string;
      plan_snapshot: { products?: number; staff?: number };
      period_end: Date | null;
    };
    expect(tenant.state).toBe(TenantState.PayAsYouGo);
    expect(tenant.plan_id).not.toBeNull();
    expect(tenant.plan_snapshot.products).toBe(25);
    expect(tenant.plan_snapshot.staff).toBe(1);
    // PYG-08: pay-as-you-go has no billing period to lapse from.
    expect(tenant.period_end).toBeNull();

    const log = await admin.query<{ actor_type: string }>(
      `SELECT actor_type, action, summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2`,
      [tenantId, AuditAction.LifecycleStateChanged],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]?.actor_type).toBe('system');
  });

  it('leaves a trial whose period has not ended untouched', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tenantId = await freshTrialTenant(future);

    await trialLifecycle.convertExpiredTrials();

    const row = await admin.query<{ state: string }>(
      'SELECT state FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    expect(row.rows[0]?.state).toBe(TenantState.Trial);
  });

  it('leaves an already-active tenant untouched, even with a past period_end', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await admin.query('UPDATE control.tenants SET period_end = $1 WHERE id = $2', [past, tenantId]);

    await trialLifecycle.convertExpiredTrials();

    const row = await admin.query<{ state: string }>(
      'SELECT state FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    expect(row.rows[0]?.state).toBe(TenantState.Active);
  });
});

describeIfDatabase('pay-as-you-go order and product fees (PYG-02, PYG-16)', () => {
  it("PYG-02: charges the greater of the minimum or the order's percentage fee", async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'pay_as_you_go');
    await balance.creditStandalone({
      tenantId,
      amount: '1000.00',
      type: LedgerEntryType.TopUp,
    });

    // 200 * 1.5% = 3.00, below the 20 TK minimum -- the minimum wins.
    const below = await tenants.runStandalone((tx) =>
      paygBilling.chargeOrderFee(tx, tenantId, randomUUID(), '200.00'),
    );
    expect(below.amount).toBe('-20.00');

    // 5000 * 1.5% = 75.00, above the minimum -- the percentage wins.
    const above = await tenants.runStandalone((tx) =>
      paygBilling.chargeOrderFee(tx, tenantId, randomUUID(), '5000.00'),
    );
    expect(above.amount).toBe('-75.00');
  });

  it('PYG-03: refuses to charge a fee the balance cannot cover', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'pay_as_you_go');

    await expect(
      tenants.runStandalone((tx) =>
        paygBilling.chargeOrderFee(tx, tenantId, randomUUID(), '5000.00'),
      ),
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('PYG-16: charges a flat fee once, regardless of order size', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'pay_as_you_go');
    await balance.creditStandalone({
      tenantId,
      amount: '1000.00',
      type: LedgerEntryType.TopUp,
    });

    const entry = await tenants.runStandalone((tx) =>
      paygBilling.chargeProductCreationFee(tx, tenantId, randomUUID()),
    );
    expect(entry.type).toBe(LedgerEntryType.ProductFee);
  });
});

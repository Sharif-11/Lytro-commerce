import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AuditAction,
  LedgerEntryType,
  RateKey,
  TenantState,
  VERIFICATION_FEES_WAIVED_FEATURE,
} from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { TrialLifecycleService } from '../src/modules/billing/services/trial-lifecycle.service';
import { PayAsYouGoBillingService } from '../src/modules/balance/services/payg-billing.service';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { RateService } from '../src/modules/balance/services/rate.service';
import { VerificationFees } from '../src/modules/balance/services/verification-fees';
import { TenantService } from '../src/modules/tenancy/services/tenant.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { openShop } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 2 slice 3: the trial-end conversion to pay-as-you-go (TRL-07) and the pay-as-you-go order/product
// fee math (PYG-02, PYG-16). Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_trial_lifecycle_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let trialLifecycle: TrialLifecycleService;
let paygBilling: PayAsYouGoBillingService;
let balance: BalanceService;
let rates: RateService;
let tenants: TenantService;
let fees: VerificationFees;
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
  ({ app, port } = await listenOn(moduleRef));
  trialLifecycle = app.get(TrialLifecycleService);
  paygBilling = app.get(PayAsYouGoBillingService);
  balance = app.get(BalanceService);
  rates = app.get(RateService);
  tenants = app.get(TenantService);
  fees = app.get(VerificationFees);
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

// TRL-03, TRL-07, WAL-20 (amended 2026-11-24, the owner): a new shop holds the Trial plan's features as they stand, the
// payment-check fee waiver included, until the trial-end conversion puts pay-as-you-go's own in their place. The fees are
// asked of VerificationFees itself, since the listener and the wallet checkout also pass over a shop still on its trial.
describeIfDatabase("a trial shop holds the Trial plan's features (TRL-03, TRL-07, WAL-20)", () => {
  const WAIVED = { [VERIFICATION_FEES_WAIVED_FEATURE]: true };
  const PAYMENT = { sessionId: randomUUID(), orderId: randomUUID(), amount: '1000.00' };

  /** Opens a shop by sign-up while the Trial carries `features`, then puts the Trial back as it was. */
  async function shopOpenedWhileTrialHas(features: Record<string, boolean>): Promise<string> {
    const trial = "name = 'Trial' AND NOT for_sale";
    const before = await admin.query<{ features: Record<string, boolean> }>(
      `SELECT features FROM control.plans WHERE ${trial}`,
    );
    await admin.query(`UPDATE control.plans SET features = $1 WHERE ${trial}`, [
      JSON.stringify(features),
    ]);
    try {
      const shop = await openShop(port, texts, 'trial');
      await balance.creditStandalone({
        tenantId: shop.tenantId,
        amount: '100.00',
        type: LedgerEntryType.TopUp,
      });
      return shop.tenantId;
    } finally {
      await admin.query(`UPDATE control.plans SET features = $1 WHERE ${trial}`, [
        JSON.stringify(before.rows[0]?.features ?? {}),
      ]);
    }
  }

  async function snapshotOf(tenantId: string) {
    const row = await admin.query<{
      state: string;
      feature_snapshot: Record<string, boolean> | null;
      plan_version_snapshot: number | null;
      plan_version: number;
      plan_features: Record<string, boolean>;
    }>(
      `SELECT t.state, t.feature_snapshot, t.plan_version_snapshot, p.version AS plan_version,
              p.features AS plan_features
       FROM control.tenants t JOIN control.plans p ON p.id = t.plan_id WHERE t.id = $1`,
      [tenantId],
    );
    const snapshot = row.rows[0];
    if (!snapshot) throw new Error(`no tenant ${tenantId}`);
    return snapshot;
  }

  const gatewayHold = (tenantId: string) =>
    balance.runStandalone(tenantId, (tx) => fees.holdGateway(tx, tenantId, '1000.00', new Date()));
  const listenerFee = (tenantId: string) =>
    balance.runStandalone(tenantId, (tx) => fees.chargeListener(tx, tenantId, PAYMENT, new Date()));
  const feesCharged = async (tenantId: string) =>
    (
      await admin.query<{ amount: string }>(
        `SELECT amount FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'verification_fee'`,
        [tenantId],
      )
    ).rows.map((entry) => entry.amount);

  it("snapshots the Trial's version and features, and a waiver there holds and charges no fee", async () => {
    const tenantId = await shopOpenedWhileTrialHas(WAIVED);

    const snapshot = await snapshotOf(tenantId);
    expect(snapshot.feature_snapshot).toEqual(WAIVED);
    expect(snapshot.plan_version_snapshot).toBe(snapshot.plan_version);

    await expect(gatewayHold(tenantId)).resolves.toBe('0.00');
    await expect(listenerFee(tenantId)).resolves.toBe('nothing');
    expect(await feesCharged(tenantId)).toEqual([]);
  });

  it('a shop opened while the Trial has no waiver is held and charged as before', async () => {
    const tenantId = await shopOpenedWhileTrialHas({});

    expect((await snapshotOf(tenantId)).feature_snapshot).toEqual({});
    // 1.00% of ৳1,000 through a wallet's checkout; 0.10% through the listener.
    await expect(gatewayHold(tenantId)).resolves.toBe('10.00');
    await expect(listenerFee(tenantId)).resolves.toBe('charged');
    expect(await feesCharged(tenantId)).toEqual(['-1.00']);
  });

  it("ends the waiver with the trial: pay-as-you-go's features replace it, and the fee is charged again", async () => {
    const tenantId = await shopOpenedWhileTrialHas(WAIVED);
    // A snapshot: the Trial put back since changes nothing for the shop already on it.
    await expect(listenerFee(tenantId)).resolves.toBe('nothing');

    await admin.query('UPDATE control.tenants SET period_end = $1 WHERE id = $2', [
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      tenantId,
    ]);
    await trialLifecycle.convertExpiredTrials();

    const snapshot = await snapshotOf(tenantId);
    expect(snapshot.state).toBe(TenantState.PayAsYouGo);
    expect(snapshot.feature_snapshot).toEqual(snapshot.plan_features);
    expect(snapshot.feature_snapshot?.[VERIFICATION_FEES_WAIVED_FEATURE]).toBeUndefined();
    await expect(gatewayHold(tenantId)).resolves.toBe('10.00');
    await expect(listenerFee(tenantId)).resolves.toBe('charged');
    expect(await feesCharged(tenantId)).toEqual(['-1.00']);
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
    expect(below?.amount).toBe('-20.00');

    // 5000 * 1.5% = 75.00, above the minimum -- the percentage wins.
    const above = await tenants.runStandalone((tx) =>
      paygBilling.chargeOrderFee(tx, tenantId, randomUUID(), '5000.00'),
    );
    expect(above?.amount).toBe('-75.00');

    // 1234.56 * 1.5% = 18.5184, above a 15 TK minimum: exact paisa arithmetic rounds it to 18.52.
    await rates.change(RateKey.PaygOrderFeeMin, '15', randomUUID(), null);
    try {
      const rounded = await tenants.runStandalone((tx) =>
        paygBilling.chargeOrderFee(tx, tenantId, randomUUID(), '1234.56'),
      );
      expect(rounded?.amount).toBe('-18.52');
    } finally {
      await rates.change(RateKey.PaygOrderFeeMin, '20', randomUUID(), null);
    }
  });

  it('PYG-03: refuses to charge a fee the balance cannot cover', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'pay_as_you_go');

    await expect(
      tenants.runStandalone((tx) =>
        paygBilling.chargeOrderFee(tx, tenantId, randomUUID(), '5000.00'),
      ),
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('PYG-16, OD-48: charges the flat 10 TK fee once, regardless of order size', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'pay_as_you_go');
    await balance.creditStandalone({
      tenantId,
      amount: '1000.00',
      type: LedgerEntryType.TopUp,
    });

    const entry = await tenants.runStandalone((tx) =>
      paygBilling.chargeProductCreationFee(tx, tenantId, randomUUID()),
    );
    expect(entry?.type).toBe(LedgerEntryType.ProductFee);
    expect(entry?.amount).toBe('-10.00'); // 2.1's pay-as-you-go product fee
  });

  it('BAL-02: a fee the operator set to nothing is no charge and writes no entry', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'pay_as_you_go');
    await rates.change(RateKey.PaygProductFee, '0', randomUUID(), null);
    try {
      const entry = await tenants.runStandalone((tx) =>
        paygBilling.chargeProductCreationFee(tx, tenantId, randomUUID()),
      );
      expect(entry).toBeNull();
    } finally {
      await rates.change(RateKey.PaygProductFee, '10', randomUUID(), null);
    }
    const rows = await admin.query<{ count: string }>(
      'SELECT count(*)::text FROM tenant.balance_ledger WHERE tenant_id = $1',
      [tenantId],
    );
    expect(rows.rows[0]?.count).toBe('0');
    expect((await balance.current(tenantId)).amount).toBe('0.00');
  });
});

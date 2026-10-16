import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction, LedgerEntryType, TenantState } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { LifecycleService } from '../src/modules/billing/services/lifecycle.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { SmsCapture } from './support/sms-capture';

// Phase 2 slice 7: LIF-01 to LIF-26, PYG-21. White-box, test-clock-driven -- the same pattern
// TrialLifecycleService's and DowngradeService.apply's own specs already use: seed a tenant at a known
// offset, call the job method directly (never through a real cron), assert the resulting state.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_lifecycle_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const DAY_MS = 24 * 60 * 60 * 1000;

let app: INestApplication;
let admin: pg.Client;
let lifecycle: LifecycleService;
let purchase: PurchaseService;
let balance: BalanceService;
const texts = new SmsCapture();

const freshSlug = (): string => `t${randomUUID().replace(/-/g, '').slice(0, 10)}`;
let nextRank = 800000;

async function seedPlan(rank: number): Promise<string> {
  const plan = await admin.query<{ id: string }>(
    `INSERT INTO control.plans (name, rank, for_sale, version, limits, features)
     VALUES ($1, $2, true, 1, '{}', '{}') RETURNING id`,
    [`Test Plan ${freshSlug()}`, rank],
  );
  return plan.rows[0]?.id ?? '';
}

async function activateTenant(
  tenantId: string,
  planId: string,
  state: string,
  periodEnd: Date | null,
  frozen = false,
): Promise<void> {
  await admin.query(
    `UPDATE control.tenants SET state = $1, plan_id = $2, period_start = now(), period_end = $3,
       balance_frozen = $4
     WHERE id = $5`,
    [state, planId, periodEnd, frozen, tenantId],
  );
}

async function tenantRow(tenantId: string) {
  const row = await admin.query<{
    state: TenantState;
    balance_frozen: boolean;
    deleted_at: Date | null;
  }>('SELECT state, balance_frozen, deleted_at FROM control.tenants WHERE id = $1', [tenantId]);
  return row.rows[0];
}

async function auditActions(tenantId: string): Promise<AuditAction[]> {
  const log = await admin.query<{ action: AuditAction }>(
    'SELECT action FROM tenant.activity_log WHERE tenant_id = $1 ORDER BY created_at ASC',
    [tenantId],
  );
  return log.rows.map((row) => row.action);
}

async function seedOwner(tenantId: string, phone: string): Promise<void> {
  await admin.query(
    `INSERT INTO tenant.users (tenant_id, phone, name, is_owner, active) VALUES ($1, $2, 'Owner', true, true)`,
    [tenantId, phone],
  );
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'lifecycle-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app } = await listenOn(moduleRef));
  lifecycle = app.get(LifecycleService);
  purchase = app.get(PurchaseService);
  balance = app.get(BalanceService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('LIF-04/09: deriving and applying the lapse state', () => {
  it('a tenant 4 days past period end reaches read_only and is frozen, with no manual write', async () => {
    const planId = await seedPlan((nextRank += 1));
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const periodEnd = new Date(Date.now() - 4 * DAY_MS);
    await activateTenant(tenantId, planId, TenantState.Active, periodEnd);

    await lifecycle.runTick(new Date());

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.ReadOnly);
    expect(tenant?.balance_frozen).toBe(true);

    await expect(
      balance.chargeStandalone({ tenantId, type: LedgerEntryType.Sms, amount: '1.00' }),
    ).rejects.toMatchObject({ code: 'tenant_offline' });
  });

  it('LIF-23: a second tick the same moment produces no extra transition or audit entry', async () => {
    const planId = await seedPlan((nextRank += 1));
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const periodEnd = new Date(Date.now() - 10 * DAY_MS); // -> locked (grace 3 + read_only 4 + locked 8 = 15)
    await activateTenant(tenantId, planId, TenantState.Active, periodEnd);

    await lifecycle.runTick(new Date());
    const afterFirst = await auditActions(tenantId);
    const firstCount = afterFirst.filter((a) => a === AuditAction.LifecycleStateChanged).length;

    await lifecycle.runTick(new Date());
    const afterSecond = await auditActions(tenantId);
    const secondCount = afterSecond.filter((a) => a === AuditAction.LifecycleStateChanged).length;

    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1); // unchanged -- deriveState gives the same answer both times
    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.Locked);
  });
});

describeIfDatabase('LIF-15: restoring a lapsed tenant', () => {
  it('a locked, frozen tenant paying from balance ends up active and unfrozen', async () => {
    const planId = await seedPlan((nextRank += 1));
    const termId = (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', '1-month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id as string;
    await admin.query(
      'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
      [planId, termId, '199.00'],
    );
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(tenantId, planId, TenantState.Active, new Date(Date.now() + 10 * DAY_MS));
    await balance.creditStandalone({ tenantId, amount: '500.00', type: LedgerEntryType.TopUp });

    // Simulate the tenant having since lapsed into `locked`, frozen -- the state the lifecycle job would
    // have put it in days ago.
    await activateTenant(
      tenantId,
      planId,
      TenantState.Locked,
      new Date(Date.now() - 10 * DAY_MS),
      true,
    );

    const quote = await purchase.quote(tenantId, planId, termId);
    const result = await purchase.confirmFromBalance(quote.id, tenantId);
    expect(result.invoice).not.toBeNull();

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.Active);
    expect(tenant?.balance_frozen).toBe(false);
  });
});

describeIfDatabase('LIF-18: deletion warnings', () => {
  it('sends exactly one day-45 warning, never repeated, then a day-57 warning', async () => {
    const planId = await seedPlan((nextRank += 1));
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await seedOwner(tenantId, `017${(nextRank += 1).toString().slice(0, 8)}`);
    const periodEnd = new Date(Date.now() - 45 * DAY_MS);
    await activateTenant(tenantId, planId, TenantState.Archived, periodEnd, true);

    await lifecycle.runTick(new Date());
    await lifecycle.runTick(new Date()); // same day again -- must not duplicate

    const actions = await auditActions(tenantId);
    expect(actions.filter((a) => a === AuditAction.DeletionWarningSent).length).toBe(1);

    // Move the clock to day 57 (still inside the archived window, before day 60's deletion).
    await admin.query('UPDATE control.tenants SET period_end = $1 WHERE id = $2', [
      new Date(Date.now() - 57 * DAY_MS),
      tenantId,
    ]);
    await lifecycle.runTick(new Date());
    const actionsAfter = await auditActions(tenantId);
    expect(actionsAfter.filter((a) => a === AuditAction.DeletionWarningSent).length).toBe(2);
  });
});

describeIfDatabase('LIF-19: day-60 business-data deletion', () => {
  it('deletes staff/roles, sets deleted_at, and a second tick is a no-op', async () => {
    const planId = await seedPlan((nextRank += 1));
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await seedOwner(tenantId, `018${(nextRank += 1).toString().slice(0, 8)}`);
    const periodEnd = new Date(Date.now() - 61 * DAY_MS);
    await activateTenant(tenantId, planId, TenantState.Archived, periodEnd, true);

    await lifecycle.runTick(new Date());

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.Deleted);
    expect(tenant?.deleted_at).not.toBeNull();
    const staffRows = await admin.query('SELECT 1 FROM tenant.users WHERE tenant_id = $1', [
      tenantId,
    ]);
    expect(staffRows.rowCount).toBe(0);

    const deletedCountBefore = (await auditActions(tenantId)).filter(
      (a) => a === AuditAction.TenantDeleted,
    ).length;
    await lifecycle.runTick(new Date()); // deletedAt is now set -- excluded from candidates, no retry
    const deletedCountAfter = (await auditActions(tenantId)).filter(
      (a) => a === AuditAction.TenantDeleted,
    ).length;
    expect(deletedCountAfter).toBe(deletedCountBefore);
  });
});

describeIfDatabase('PYG-21: pay-as-you-go inactivity', () => {
  it('warns at day 23 and archives at day 30, with no grace/read-only stop', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await seedOwner(tenantId, `019${(nextRank += 1).toString().slice(0, 8)}`);
    await admin.query(
      `UPDATE control.tenants SET state = 'pay_as_you_go', period_end = NULL,
         last_activity_at = $1 WHERE id = $2`,
      [new Date(Date.now() - 23 * DAY_MS), tenantId],
    );

    await lifecycle.runTick(new Date());
    let tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.PayAsYouGo); // still active at day 23, just warned
    const actions = await auditActions(tenantId);
    expect(actions.filter((a) => a === AuditAction.DeletionWarningSent).length).toBe(1);

    await admin.query('UPDATE control.tenants SET last_activity_at = $1 WHERE id = $2', [
      new Date(Date.now() - 30 * DAY_MS),
      tenantId,
    ]);
    await lifecycle.runTick(new Date());
    tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.Archived);
    expect(tenant?.balance_frozen).toBe(true);
  });
});

describeIfDatabase('LIF-01: cancel and undo', () => {
  it('audits the cancellation and the undo', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');

    await lifecycle.cancelSubscription(tenantId);
    await lifecycle.undoCancellation(tenantId);

    const actions = await auditActions(tenantId);
    expect(actions).toContain(AuditAction.SubscriptionCancelled);
    expect(actions).toContain(AuditAction.SubscriptionCancellationUndone);
  });

  it('getCancellation reads back the same flag cancel/undo write', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');

    expect((await lifecycle.getCancellation(tenantId)).cancelledAt).toBeNull();

    await lifecycle.cancelSubscription(tenantId);
    expect((await lifecycle.getCancellation(tenantId)).cancelledAt).not.toBeNull();

    await lifecycle.undoCancellation(tenantId);
    expect((await lifecycle.getCancellation(tenantId)).cancelledAt).toBeNull();
  });
});

describeIfDatabase('BIL-17: renew automatically from balance', () => {
  async function seedTermAndPrice(planId: string, price: string): Promise<string> {
    const termId = (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', '1-month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id as string;
    await admin.query(
      'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
      [planId, termId, price],
    );
    return termId;
  }

  async function setAutoRenewFields(
    tenantId: string,
    termId: string,
    enabled: boolean,
  ): Promise<void> {
    await admin.query(
      'UPDATE control.tenants SET billing_term_id = $1, auto_renew_enabled = $2 WHERE id = $3',
      [termId, enabled, tenantId],
    );
  }

  it('toggling writes the flag and an audit entry', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');

    await lifecycle.setAutoRenew(tenantId, true);
    let row = await admin.query<{ auto_renew_enabled: boolean }>(
      'SELECT auto_renew_enabled FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    expect(row.rows[0]?.auto_renew_enabled).toBe(true);

    await lifecycle.setAutoRenew(tenantId, false);
    row = await admin.query<{ auto_renew_enabled: boolean }>(
      'SELECT auto_renew_enabled FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    expect(row.rows[0]?.auto_renew_enabled).toBe(false);

    const actions = await auditActions(tenantId);
    expect(actions.filter((a) => a === AuditAction.AutoRenewToggled).length).toBe(2);
  });

  it('with the toggle on and enough balance, renews from balance instead of lapsing', async () => {
    const planId = await seedPlan((nextRank += 1));
    const termId = await seedTermAndPrice(planId, '199.00');
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(tenantId, planId, TenantState.Active, new Date(Date.now() - DAY_MS));
    await setAutoRenewFields(tenantId, termId, true);
    await balance.creditStandalone({ tenantId, amount: '500.00', type: LedgerEntryType.TopUp });

    const result = await lifecycle.runTick(new Date());
    expect(result.renewed).toBe(1);

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.Active);
    const actions = await auditActions(tenantId);
    expect(actions).toContain(AuditAction.PlanRenewed);
    expect(actions).not.toContain(AuditAction.LifecycleStateChanged);
  });

  it('with the toggle on but insufficient balance, falls through to the normal lapse', async () => {
    const planId = await seedPlan((nextRank += 1));
    const termId = await seedTermAndPrice(planId, '199.00');
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(tenantId, planId, TenantState.Active, new Date(Date.now() - DAY_MS));
    await setAutoRenewFields(tenantId, termId, true);

    const result = await lifecycle.runTick(new Date());
    expect(result.renewed).toBe(0);

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.Grace);
    const actions = await auditActions(tenantId);
    expect(actions).not.toContain(AuditAction.PlanRenewed);
  });

  it('with the toggle off, no charge is attempted even with sufficient balance', async () => {
    const planId = await seedPlan((nextRank += 1));
    const termId = await seedTermAndPrice(planId, '199.00');
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(tenantId, planId, TenantState.Active, new Date(Date.now() - DAY_MS));
    await setAutoRenewFields(tenantId, termId, false);
    await balance.creditStandalone({ tenantId, amount: '500.00', type: LedgerEntryType.TopUp });

    const result = await lifecycle.runTick(new Date());
    expect(result.renewed).toBe(0);

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.Grace);
  });

  it('LIF-01: a cancelled subscription never auto-renews even with the toggle on', async () => {
    const planId = await seedPlan((nextRank += 1));
    const termId = await seedTermAndPrice(planId, '199.00');
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(tenantId, planId, TenantState.Active, new Date(Date.now() - DAY_MS));
    await setAutoRenewFields(tenantId, termId, true);
    await balance.creditStandalone({ tenantId, amount: '500.00', type: LedgerEntryType.TopUp });
    await lifecycle.cancelSubscription(tenantId);

    const result = await lifecycle.runTick(new Date());
    expect(result.renewed).toBe(0);

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.Grace);
  });
});

describeIfDatabase('LIF-21: the old shop identity is revoked 30 days after deletion', () => {
  async function markDeletedAt(tenantId: string, deletedAt: Date): Promise<void> {
    await admin.query(
      `UPDATE control.tenants SET deleted_at = $1, state = 'deleted' WHERE id = $2`,
      [deletedAt, tenantId],
    );
  }

  async function tenantIdentityRow(tenantId: string) {
    const row = await admin.query<{
      slug: string;
      shop_name: string;
      contact_phone: string | null;
      contact_email: string | null;
      business_address: string | null;
      suspended_reason: string | null;
      kyc_status: string;
      plan_id: string | null;
      balance_amount: string;
      subscriber_id: string;
    }>(
      `SELECT slug, shop_name, contact_phone, contact_email, business_address, suspended_reason,
         kyc_status, plan_id, balance_amount, subscriber_id
       FROM control.tenants WHERE id = $1`,
      [tenantId],
    );
    return row.rows[0];
  }

  it('revokes the slug and every other identity/contact field once deleted 30+ days, never sooner', async () => {
    const slug = freshSlug();
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, slug, 'trial');
    const planId = await seedPlan((nextRank += 1));
    await admin.query(
      `UPDATE control.tenants SET plan_id = $1, balance_amount = '250.00',
         contact_phone = '01711111111', contact_email = 'owner@example.com',
         business_address = '123 Main Road', suspended_reason = 'past policy note',
         kyc_status = 'verified'
       WHERE id = $2`,
      [planId, tenantId],
    );
    await markDeletedAt(tenantId, new Date(Date.now() - 31 * DAY_MS));

    const stillReservedSlug = freshSlug();
    const stillReservedTenantId = await seedShop(
      admin,
      `Shop ${freshSlug()}`,
      stillReservedSlug,
      'trial',
    );
    await markDeletedAt(stillReservedTenantId, new Date(Date.now() - 10 * DAY_MS));

    const result = await lifecycle.runTick(new Date());
    expect(result.slugsReleased).toBe(1);

    const revoked = await tenantIdentityRow(tenantId);
    expect(revoked?.slug).not.toBe(slug);
    expect(revoked?.slug).toContain('-revoked-');
    expect(revoked?.slug.length).toBeLessThanOrEqual(30);
    expect(revoked?.shop_name).not.toContain('Shop');
    expect(revoked?.contact_phone).toBeNull();
    expect(revoked?.contact_email).toBeNull();
    expect(revoked?.business_address).toBeNull();
    expect(revoked?.suspended_reason).toBeNull();
    expect(revoked?.kyc_status).toBe('unverified');
    // LIF-20's own survivor list is untouched by the revocation.
    expect(revoked?.plan_id).toBe(planId);
    expect(revoked?.balance_amount).toBe('250.00');

    // Still within the 30-day window -- untouched.
    const stillReserved = await tenantIdentityRow(stillReservedTenantId);
    expect(stillReserved?.slug).toBe(stillReservedSlug);

    // The original string is now free for a different subscriber to claim.
    const newTenantId = await seedShop(admin, `Shop ${freshSlug()}`, slug, 'trial');
    expect((await tenantIdentityRow(newTenantId))?.slug).toBe(slug);
  });

  it('a second tick is a no-op for an already-revoked tenant', async () => {
    const slug = freshSlug();
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, slug, 'trial');
    await markDeletedAt(tenantId, new Date(Date.now() - 31 * DAY_MS));

    await lifecycle.runTick(new Date());
    const revokedOnce = (await tenantIdentityRow(tenantId))?.slug;

    const result = await lifecycle.runTick(new Date());
    expect(result.slugsReleased).toBe(0);
    expect((await tenantIdentityRow(tenantId))?.slug).toBe(revokedOnce);
  });
});

describeIfDatabase('LIF-24: operator suspend and restore', () => {
  it('freezes on suspend and unfreezes on restore when not independently lapsed', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');

    const operatorId = randomUUID();
    await lifecycle.suspend(tenantId, 'policy violation', operatorId);
    let tenant = await tenantRow(tenantId);
    expect(tenant?.balance_frozen).toBe(true);
    const suspended = await admin.query<{ suspended_at: Date | null }>(
      'SELECT suspended_at FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    expect(suspended.rows[0]?.suspended_at).not.toBeNull();

    await lifecycle.restore(tenantId, operatorId);
    tenant = await tenantRow(tenantId);
    expect(tenant?.balance_frozen).toBe(false);
    const restored = await admin.query<{ suspended_at: Date | null }>(
      'SELECT suspended_at FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    expect(restored.rows[0]?.suspended_at).toBeNull();
  });
});

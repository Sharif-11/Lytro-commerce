import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction, LedgerEntryType } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { DowngradeService } from '../src/modules/billing/services/downgrade.service';
import { UpgradeService } from '../src/modules/billing/services/upgrade.service';
import { StaffService, type StaffTenant } from '../src/modules/staff/services/staff.service';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { SmsCapture } from './support/sms-capture';

// Phase 2 slice 6: downgrade (DWN-01 to DWN-18). Same white-box pattern slices 3-5 used -- services are
// called directly, not through HTTP; this slice's own risk is the scheduling/preview/apply logic and the
// seat-overage resolution, not request plumbing (already covered elsewhere).
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_plan_downgrade_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const PASSWORD = 'correct-horse-9';

let app: INestApplication;
let admin: pg.Client;
let downgrade: DowngradeService;
let upgrade: UpgradeService;
let staff: StaffService;
let balance: BalanceService;
const texts = new SmsCapture();

const freshSlug = (): string => `t${randomUUID().replace(/-/g, '').slice(0, 10)}`;
let nextRank = 700000;
let nextPhone = 1000000;
const freshPhone = (): string => `0171${(nextPhone++).toString()}`;

async function seedPlan(rank: number, staffLimit: number): Promise<string> {
  const plan = await admin.query<{ id: string }>(
    `INSERT INTO control.plans (name, rank, for_sale, version, limits, features)
     VALUES ($1, $2, true, 1, $3, '{}') RETURNING id`,
    [`Test Plan ${freshSlug()}`, rank, JSON.stringify({ staff: staffLimit })],
  );
  return plan.rows[0]?.id ?? '';
}

async function seedPlanWithRetention(rank: number, activityRetentionDays: number): Promise<string> {
  const plan = await admin.query<{ id: string }>(
    `INSERT INTO control.plans (name, rank, for_sale, version, limits, features)
     VALUES ($1, $2, true, 1, $3, '{}') RETURNING id`,
    [
      `Test Plan ${freshSlug()}`,
      rank,
      JSON.stringify({ staff: 10, activity_retention_days: activityRetentionDays }),
    ],
  );
  return plan.rows[0]?.id ?? '';
}

async function tenantRow(tenantId: string) {
  const row = await admin.query<{
    state: string;
    plan_id: string | null;
    plan_snapshot: { staff?: number };
    period_start: Date | null;
    period_end: Date | null;
    balance_amount: string;
  }>(
    'SELECT state, plan_id, plan_snapshot, period_start, period_end, balance_amount FROM control.tenants WHERE id = $1',
    [tenantId],
  );
  return row.rows[0];
}

async function activateTenant(
  tenantId: string,
  planId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {
  // plan_snapshot is kept in sync with plan_id here too (sourced straight from the plan row), the same
  // invariant every real assignment path (`applyPlanAssignment`) already keeps -- DWN-11's floor math reads
  // the pre-downgrade snapshot, so a test that skips this would silently read a stale (trial) snapshot.
  await admin.query(
    `UPDATE control.tenants SET state = 'active', plan_id = $1, period_start = $2, period_end = $3,
       plan_snapshot = (SELECT limits FROM control.plans WHERE id = $1)
     WHERE id = $4`,
    [planId, periodStart, periodEnd, tenantId],
  );
}

async function retentionRow(tenantId: string) {
  const row = await admin.query<{
    retention_floor_days: number | null;
    retention_floor_until: Date | null;
  }>('SELECT retention_floor_days, retention_floor_until FROM control.tenants WHERE id = $1', [
    tenantId,
  ]);
  return row.rows[0];
}

async function auditActions(tenantId: string): Promise<string[]> {
  const log = await admin.query<{ action: string }>(
    'SELECT action FROM tenant.activity_log WHERE tenant_id = $1 ORDER BY created_at ASC',
    [tenantId],
  );
  return log.rows.map((row) => row.action);
}

// seedShop (the raw-SQL fixture every e2e spec shares) never inserts a tenant.users owner row -- that
// normally only happens through the real create-shop flow (TenantService.createTrialShop -> StaffService.
// createOwner). DWN-08's seat math needs a real owner row to count, so tests that exercise it seed one here.
async function seedOwner(tenantId: string): Promise<string> {
  const phone = freshPhone();
  await admin.query(
    `INSERT INTO tenant.users (tenant_id, phone, name, is_owner, active) VALUES ($1, $2, 'Owner', true, true)`,
    [tenantId, phone],
  );
  return phone;
}

async function addStaff(tenantId: string, count: number): Promise<void> {
  const tenant: StaffTenant = { id: tenantId, planLimits: { staff: 10 } };
  for (let i = 0; i < count; i += 1) {
    await staff.create(tenant, { phone: freshPhone(), password: PASSWORD, roleIds: [] }, null);
  }
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'plan-downgrade-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app } = await listenOn(moduleRef));
  downgrade = app.get(DowngradeService);
  upgrade = app.get(UpgradeService);
  staff = app.get(StaffService);
  balance = app.get(BalanceService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('scheduling a downgrade (DWN-01, DWN-02)', () => {
  it('schedules without changing anything immediately', async () => {
    const highRank = (nextRank += 2);
    const highPlanId = await seedPlan(highRank, 10);
    const lowPlanId = await seedPlan(highRank - 1, 2);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await activateTenant(tenantId, highPlanId, periodStart, periodEnd);
    const before = await tenantRow(tenantId);

    const change = await downgrade.schedule(tenantId, lowPlanId);
    expect(change.targetPlanId).toBe(lowPlanId);
    expect(change.effectiveAt.getTime()).toBe(periodEnd.getTime());

    const after = await tenantRow(tenantId);
    expect(after?.plan_id).toBe(before?.plan_id);
    expect(after?.period_end?.getTime()).toBe(before?.period_end?.getTime());
  });

  it('DWN-02 reversed: refuses a target with an equal or higher rank', async () => {
    const rank = (nextRank += 2);
    const currentPlanId = await seedPlan(rank - 1, 10);
    const higherPlanId = await seedPlan(rank, 10);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(
      tenantId,
      currentPlanId,
      new Date(),
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );

    await expect(downgrade.schedule(tenantId, higherPlanId)).rejects.toMatchObject({
      code: 'validation_error',
    });
  });
});

describeIfDatabase('preview and cancel (DWN-03, DWN-04)', () => {
  it('DWN-03: previews the seat overage with correct counts', async () => {
    const rank = (nextRank += 2);
    const highPlanId = await seedPlan(rank, 10);
    const lowPlanId = await seedPlan(rank - 1, 2);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(
      tenantId,
      highPlanId,
      new Date(),
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );
    await seedOwner(tenantId);
    await addStaff(tenantId, 3); // owner + 3 = 4 active users

    const items = await downgrade.preview(tenantId, lowPlanId);
    expect(items).toContainEqual({ key: 'staff', used: 4, limit: 2 });
  });

  it('DWN-04: cancelling removes the schedule; a second cancel answers not_found', async () => {
    const rank = (nextRank += 2);
    const highPlanId = await seedPlan(rank, 10);
    const lowPlanId = await seedPlan(rank - 1, 2);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(
      tenantId,
      highPlanId,
      new Date(),
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );

    await downgrade.schedule(tenantId, lowPlanId);
    expect(await downgrade.getScheduled(tenantId)).not.toBeNull();

    await downgrade.cancel(tenantId);
    expect(await downgrade.getScheduled(tenantId)).toBeNull();
    await expect(downgrade.cancel(tenantId)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describeIfDatabase('applying a downgrade (DWN-06, DWN-08, DWN-16, DWN-17)', () => {
  it('swaps the snapshot and deactivates exactly the right staff, leaving the balance untouched', async () => {
    const rank = (nextRank += 2);
    const highPlanId = await seedPlan(rank, 10);
    const lowPlanId = await seedPlan(rank - 1, 2);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const periodStart = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await activateTenant(tenantId, highPlanId, periodStart, periodEnd);
    await balance.creditStandalone({
      tenantId,
      amount: '500.00',
      type: LedgerEntryType.TopUp,
    });
    await seedOwner(tenantId);
    await addStaff(tenantId, 3); // owner + 3 = 4 active users, against a 2-seat target

    const balanceBefore = await balance.current(tenantId);
    const change = await downgrade.schedule(tenantId, lowPlanId);
    await downgrade.apply(change, new Date());

    const tenant = await tenantRow(tenantId);
    expect(tenant?.plan_id).toBe(lowPlanId);
    expect(tenant?.plan_snapshot.staff).toBe(2);
    // DWN-06's apply swaps the plan only -- the running period's own dates are untouched.
    expect(tenant?.period_start?.getTime()).toBe(periodStart.getTime());
    expect(tenant?.period_end?.getTime()).toBe(periodEnd.getTime());

    const list = await staff.list({ id: tenantId, planLimits: { staff: 2 } });
    const activeCount = list.staff.filter((member) => member.active).length;
    expect(activeCount).toBe(2);
    expect(list.staff).toHaveLength(4); // nobody deleted
    const owner = list.staff.find((member) => member.isOwner);
    expect(owner?.active).toBe(true);

    const balanceAfter = await balance.current(tenantId);
    expect(balanceAfter.amount).toBe(balanceBefore.amount);

    const log = await admin.query<{ action: string }>(
      'SELECT action FROM tenant.activity_log WHERE tenant_id = $1 ORDER BY created_at ASC',
      [tenantId],
    );
    const actions = log.rows.map((row) => row.action);
    const scheduledIdx = actions.indexOf(AuditAction.DowngradeScheduled);
    const appliedIdx = actions.indexOf(AuditAction.DowngradeApplied);
    const staffDeactivated: string = AuditAction.StaffDeactivated;
    const deactivatedCount = actions.filter((a) => a === staffDeactivated).length;
    expect(scheduledIdx).toBeGreaterThanOrEqual(0);
    expect(appliedIdx).toBeGreaterThan(scheduledIdx);
    expect(deactivatedCount).toBe(2);

    // the scheduled row is consumed once applied.
    expect(await downgrade.getScheduled(tenantId)).toBeNull();
  });
});

describeIfDatabase('the recurring tick’s own entry point (DWN-06/08/15/17)', () => {
  it('applies only the scheduled change whose effective date has already passed', async () => {
    const rank = (nextRank += 2);
    const highPlanId = await seedPlan(rank, 10);
    const lowPlanId = await seedPlan(rank - 1, 10);

    // Due: its period (and so its scheduled effective_at) ended yesterday.
    const dueTenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(
      dueTenantId,
      highPlanId,
      new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    );
    await downgrade.schedule(dueTenantId, lowPlanId);

    // Not due: its period still has ten days left.
    const notDueTenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(
      notDueTenantId,
      highPlanId,
      new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );
    await downgrade.schedule(notDueTenantId, lowPlanId);

    const applied = await downgrade.applyDueChanges(new Date());
    expect(applied).toBe(1);

    const dueTenant = await tenantRow(dueTenantId);
    expect(dueTenant?.plan_id).toBe(lowPlanId);
    expect(await downgrade.getScheduled(dueTenantId)).toBeNull();

    const notDueTenant = await tenantRow(notDueTenantId);
    expect(notDueTenant?.plan_id).toBe(highPlanId);
    expect(await downgrade.getScheduled(notDueTenantId)).not.toBeNull();
  });
});

describeIfDatabase('UPG-13: an upgrade cancels a pending downgrade', () => {
  it('leaves no scheduled_plan_changes row behind', async () => {
    const rank = (nextRank += 2);
    const midPlanId = await seedPlan(rank, 10);
    const lowPlanId = await seedPlan(rank - 1, 10);
    const highPlanId = await seedPlan(rank + 1, 10);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await balance.creditStandalone({
      tenantId,
      amount: '10000.00',
      type: LedgerEntryType.TopUp,
    });
    await activateTenant(
      tenantId,
      midPlanId,
      new Date(),
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );

    await downgrade.schedule(tenantId, lowPlanId);
    expect(await downgrade.getScheduled(tenantId)).not.toBeNull();

    const term = await admin.query<{ id: string }>(
      `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
       VALUES ('মাস', '1-month', 1, true, 0) RETURNING id`,
    );
    const termId = term.rows[0]?.id ?? '';
    await admin.query(
      'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
      [highPlanId, termId, '699.00'],
    );

    const quote = await upgrade.quote(tenantId, highPlanId, termId);
    const result = await upgrade.confirmFromBalance(quote.id, tenantId);
    expect(result.invoice).not.toBeNull();

    expect(await downgrade.getScheduled(tenantId)).toBeNull();
  });
});

describeIfDatabase('DWN-11: shorter retention is delayed 14 days, with a notice', () => {
  it('sets a 14-day floor at the old (longer) retention and sends a notice naming a real count', async () => {
    const rank = (nextRank += 10); // wide gap: the neighboring UPG-13 block above also uses rank+1
    const highPlanId = await seedPlanWithRetention(rank, 90);
    const lowPlanId = await seedPlanWithRetention(rank - 1, 30);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const phone = await seedOwner(tenantId);
    await activateTenant(
      tenantId,
      highPlanId,
      new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );
    // One entry that would survive the old 90-day retention but not the new 30-day one (45 days old) --
    // the exact gap the floor is supposed to protect, and the notice's count should include it.
    await admin.query(
      `INSERT INTO tenant.activity_log (tenant_id, actor_type, action, result, created_at)
       VALUES ($1, 'system', 'shop_settings_updated', 'success', now() - interval '45 days')`,
      [tenantId],
    );

    const change = await downgrade.schedule(tenantId, lowPlanId);
    const now = new Date();
    await downgrade.apply(change, now);

    const retention = await retentionRow(tenantId);
    expect(retention?.retention_floor_days).toBe(90);
    const until = retention?.retention_floor_until;
    expect(until).not.toBeNull();
    const daysUntilFloorLifts = Math.round(
      ((until as Date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(daysUntilFloorLifts).toBe(14);

    const actions = await auditActions(tenantId);
    expect(actions).toContain(AuditAction.RetentionShortenedNoticeSent);

    const sms = await admin.query<{ body: string }>(
      `SELECT body FROM control.sms_outbox WHERE to_phone = $1 ORDER BY created_at DESC LIMIT 1`,
      [phone],
    );
    expect(sms.rows[0]?.body).toContain('1 older entry');
  });

  it('a downgrade to an equal or longer retention sets no floor and sends no notice', async () => {
    const rank = (nextRank += 2);
    const highPlanId = await seedPlanWithRetention(rank, 30);
    const lowPlanId = await seedPlanWithRetention(rank - 1, 30);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await seedOwner(tenantId);
    await activateTenant(
      tenantId,
      highPlanId,
      new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );

    const change = await downgrade.schedule(tenantId, lowPlanId);
    await downgrade.apply(change, new Date());

    const retention = await retentionRow(tenantId);
    expect(retention?.retention_floor_days).toBeNull();
    expect(retention?.retention_floor_until).toBeNull();
    const actions = await auditActions(tenantId);
    expect(actions).not.toContain(AuditAction.RetentionShortenedNoticeSent);
  });

  it('a second downgrade during an active floor never shortens the protection already owed', async () => {
    const rank = (nextRank += 3);
    const highPlanId = await seedPlanWithRetention(rank, 90);
    const midPlanId = await seedPlanWithRetention(rank - 1, 30);
    const lowPlanId = await seedPlanWithRetention(rank - 2, 10);
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await seedOwner(tenantId);
    await activateTenant(
      tenantId,
      highPlanId,
      new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );

    const firstChange = await downgrade.schedule(tenantId, midPlanId);
    await downgrade.apply(firstChange, new Date());
    const afterFirst = await retentionRow(tenantId);
    expect(afterFirst?.retention_floor_days).toBe(90); // the old plan's own retention, protected

    // DWN-06: apply swaps the plan only -- state stays `active` and the period's own dates are untouched,
    // so a second downgrade can be scheduled straight off the result of the first.
    const secondChange = await downgrade.schedule(tenantId, lowPlanId);
    const secondNow = new Date();
    await downgrade.apply(secondChange, secondNow);

    const afterSecond = await retentionRow(tenantId);
    // Still 90, not 30 -- the still-active floor from the first downgrade, not the live (mid) plan's own
    // retention, is what the comparison is owed against.
    expect(afterSecond?.retention_floor_days).toBe(90);
    const until = afterSecond?.retention_floor_until as Date;
    const daysUntilFloorLifts = Math.round(
      (until.getTime() - secondNow.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(daysUntilFloorLifts).toBe(14); // the clock refreshed from the second downgrade's own notice
  });
});

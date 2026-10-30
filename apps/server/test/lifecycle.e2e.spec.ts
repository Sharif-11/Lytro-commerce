import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AuditAction,
  LedgerEntryType,
  PlatformSettingKey,
  TenantState,
} from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { MAIL_PROVIDER } from '../src/modules/shared/mail/tokens';
import { LifecycleService } from '../src/modules/billing/services/lifecycle.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { TenantResolver } from '../src/modules/tenancy/services/tenant-resolver.service';
import { TenantSummaries } from '../src/modules/tenancy/services/tenant-summaries.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance, seedShop } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { MailCapture } from './support/mail-capture';

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
let platformSettings: PlatformSettingsService;
let resolver: TenantResolver;
const texts = new SmsCapture();
const mail = new MailCapture();

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

async function seedOwner(
  tenantId: string,
  phone: string,
  email: string | null = null,
): Promise<void> {
  await admin.query(
    `INSERT INTO tenant.users (tenant_id, phone, email, name, is_owner, active)
     VALUES ($1, $2, $3, 'Owner', true, true)`,
    [tenantId, phone, email],
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
    .overrideProvider(MAIL_PROVIDER)
    .useValue(mail.provider)
    .compile();
  ({ app } = await listenOn(moduleRef));
  lifecycle = app.get(LifecycleService);
  purchase = app.get(PurchaseService);
  balance = app.get(BalanceService);
  platformSettings = app.get(PlatformSettingsService);
  resolver = app.get(TenantResolver);
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

describeIfDatabase(
  'LIF-26: a stage-length change never retroactively moves an already-lapsed tenant',
  () => {
    it('an already-lapsed tenant keeps the schedule it started with; a tenant lapsing after the change gets the new one', async () => {
      const planId = await seedPlan((nextRank += 1));

      // Tenant A laps first, under the platform's default 3-day grace.
      const tenantA = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
      await activateTenant(tenantA, planId, TenantState.Active, new Date(Date.now() - DAY_MS));
      await lifecycle.runTick(new Date());
      expect((await tenantRow(tenantA))?.state).toBe(TenantState.Grace); // 1 day < grace(3)

      const operatorId = randomUUID();
      try {
        // The operator widens grace from 3 to 10 days.
        await platformSettings.set(PlatformSettingKey.GraceDays, 10, operatorId);

        // Tenant A's own clock reaches day 5 -- past its own frozen 3-day grace, but inside the new 10-day
        // one. Without LIF-26's own snapshot, the live (new) setting would wrongly keep it in grace.
        await admin.query('UPDATE control.tenants SET period_end = $1 WHERE id = $2', [
          new Date(Date.now() - 5 * DAY_MS),
          tenantA,
        ]);
        await lifecycle.runTick(new Date());
        expect((await tenantRow(tenantA))?.state).toBe(TenantState.ReadOnly);

        // Tenant B laps for the first time *after* the change -- nothing to freeze from before, so it gets
        // today's live setting: 5 days is still within the new 10-day grace.
        const tenantB = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
        await activateTenant(
          tenantB,
          planId,
          TenantState.Active,
          new Date(Date.now() - 5 * DAY_MS),
        );
        await lifecycle.runTick(new Date());
        expect((await tenantRow(tenantB))?.state).toBe(TenantState.Grace);
      } finally {
        // Other tests in this file assume the platform's own default (3) -- restore it regardless of outcome.
        await platformSettings.set(PlatformSettingKey.GraceDays, 3, operatorId);
      }
    });

    it('clears the frozen schedule on restore, so the next lapse starts fresh', async () => {
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
      await balance.creditStandalone({ tenantId, amount: '1000.00', type: LedgerEntryType.TopUp });

      // Lapses for real under the default 3-day grace -- a snapshot gets written.
      await activateTenant(tenantId, planId, TenantState.Active, new Date(Date.now() - DAY_MS));
      await lifecycle.runTick(new Date());
      expect((await tenantRow(tenantId))?.state).toBe(TenantState.Grace);

      // Restoring (a real purchase) must clear the frozen schedule.
      const quote = await purchase.quote(tenantId, planId, termId);
      await purchase.confirmFromBalance(quote.id, tenantId);
      expect((await tenantRow(tenantId))?.state).toBe(TenantState.Active);

      const operatorId = randomUUID();
      try {
        await platformSettings.set(PlatformSettingKey.GraceDays, 1, operatorId);

        // A brand-new lapse, well after the restore -- it should pick up today's (new) 1-day grace, not the
        // 3-day one frozen during the first lapse.
        await admin.query('UPDATE control.tenants SET period_end = $1 WHERE id = $2', [
          new Date(Date.now() - 2 * DAY_MS),
          tenantId,
        ]);
        await lifecycle.runTick(new Date());
        expect((await tenantRow(tenantId))?.state).toBe(TenantState.ReadOnly); // 2 days >= the new grace(1)
      } finally {
        await platformSettings.set(PlatformSettingKey.GraceDays, 3, operatorId);
      }
    });
  },
);

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

describeIfDatabase('BIL-14: renewal reminders', () => {
  it('sends exactly one email reminder at each of the 7/3/1-day thresholds, never by SMS', async () => {
    const planId = await seedPlan((nextRank += 1));
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const phone = `017${(nextRank += 1).toString().slice(0, 8)}`;
    const email = `${freshSlug()}@example.com`;
    await seedOwner(tenantId, phone, email);
    await activateTenant(tenantId, planId, TenantState.Active, new Date(Date.now() + 7 * DAY_MS));

    await lifecycle.runTick(new Date());
    await lifecycle.runTick(new Date()); // same day again -- must not duplicate

    let actions = await auditActions(tenantId);
    expect(actions.filter((a) => a === AuditAction.RenewalReminderSent).length).toBe(1);

    // Move to the 3-day threshold -- day 7 is already sent, so this is a fresh one.
    await admin.query('UPDATE control.tenants SET period_end = $1 WHERE id = $2', [
      new Date(Date.now() + 3 * DAY_MS),
      tenantId,
    ]);
    await lifecycle.runTick(new Date());
    actions = await auditActions(tenantId);
    expect(actions.filter((a) => a === AuditAction.RenewalReminderSent).length).toBe(2);

    // And the 1-day threshold.
    await admin.query('UPDATE control.tenants SET period_end = $1 WHERE id = $2', [
      new Date(Date.now() + 1 * DAY_MS),
      tenantId,
    ]);
    await lifecycle.runTick(new Date());
    actions = await auditActions(tenantId);
    expect(actions.filter((a) => a === AuditAction.RenewalReminderSent).length).toBe(3);

    const mailRows = await admin.query(
      `SELECT 1 FROM control.mail_outbox WHERE to_email = $1 AND kind = 'lifecycle_notice'`,
      [email],
    );
    expect(mailRows.rowCount).toBe(3);

    // The requirement's own carve-out: never billed to the tenant as SMS.
    const smsRows = await admin.query(`SELECT 1 FROM control.sms_outbox WHERE to_phone = $1`, [
      phone,
    ]);
    expect(smsRows.rowCount).toBe(0);
  });

  it('PYG-10: sends no reminder when the shop is switching to pay-as-you-go at period end', async () => {
    const planId = await seedPlan((nextRank += 1));
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await seedOwner(tenantId, `017${(nextRank += 1).toString().slice(0, 8)}`, null);
    const periodEnd = new Date(Date.now() + 7 * DAY_MS);
    await activateTenant(tenantId, planId, TenantState.Active, periodEnd);
    await admin.query(
      `INSERT INTO control.scheduled_plan_changes (tenant_id, kind, target_plan_id, effective_at)
       VALUES ($1, 'pay_as_you_go_switch', NULL, $2)`,
      [tenantId, periodEnd],
    );

    await lifecycle.runTick(new Date());

    expect(await auditActions(tenantId)).not.toContain(AuditAction.RenewalReminderSent);
  });

  it('a grace-period tenant gets exactly one reminder per calendar day, not per tick', async () => {
    const planId = await seedPlan((nextRank += 1));
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const phone = `016${(nextRank += 1).toString().slice(0, 8)}`;
    const email = `${freshSlug()}@example.com`;
    await seedOwner(tenantId, phone, email);
    await activateTenant(tenantId, planId, TenantState.Grace, new Date(Date.now() - DAY_MS));

    // A reminder was already sent yesterday -- today's first tick must still send a fresh one.
    await admin.query(
      `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
       VALUES ($1, 'system', NULL, 'renewal_reminder_sent', 'success', '{}', now() - interval '1 day')`,
      [tenantId],
    );

    await lifecycle.runTick(new Date());
    let actions = await auditActions(tenantId);
    expect(actions.filter((a) => a === AuditAction.RenewalReminderSent).length).toBe(2); // yesterday's + today's

    await lifecycle.runTick(new Date()); // same day again -- must not duplicate
    actions = await auditActions(tenantId);
    expect(actions.filter((a) => a === AuditAction.RenewalReminderSent).length).toBe(2);

    const mailRows = await admin.query(
      `SELECT 1 FROM control.mail_outbox WHERE to_email = $1 AND kind = 'lifecycle_notice'`,
      [email],
    );
    expect(mailRows.rowCount).toBe(1); // only today's real send queues mail -- yesterday's row was a raw insert
    const smsRows = await admin.query(`SELECT 1 FROM control.sms_outbox WHERE to_phone = $1`, [
      phone,
    ]);
    expect(smsRows.rowCount).toBe(0);
  });
});

/**
 * LIF-19: one of everything Phase 3 stores for a shop, written as the admin so the test needs no session: a
 * category tree with a size chart and a suggested attribute, a product with a variant split by a platform attribute
 * on one of the shop's own values, a describing attribute of its own, an old slug, stock, a size chart and a
 * delivery limit, an option set, the catalogue version, delivery zones with areas, and the settings row.
 */
async function seedCatalogue(tenantId: string): Promise<void> {
  const one = async (sql: string, params: unknown[]): Promise<string> => {
    const result = await admin.query<{ id: string }>(sql, params);
    return result.rows[0]?.id ?? '';
  };
  const size = await one(
    "SELECT id FROM tenant.attributes WHERE tenant_id IS NULL AND name = 'Size'",
    [],
  );
  const parent = await one(
    "INSERT INTO tenant.categories (tenant_id, name, slug, depth) VALUES ($1, 'Clothing', 'clothing', 1) RETURNING id",
    [tenantId],
  );
  const child = await one(
    "INSERT INTO tenant.categories (tenant_id, parent_id, name, slug, depth) VALUES ($1, $2, 'Shirts', 'shirts', 2) RETURNING id",
    [tenantId, parent],
  );
  const fabric = await one(
    "INSERT INTO tenant.attributes (tenant_id, name, data_type) VALUES ($1, 'Weave', 'enum_single') RETURNING id",
    [tenantId],
  );
  const twill = await one(
    "INSERT INTO tenant.attribute_options (tenant_id, attribute_id, value) VALUES ($1, $2, 'Twill') RETURNING id",
    [tenantId, fabric],
  );
  const large = await one(
    "INSERT INTO tenant.attribute_options (tenant_id, attribute_id, value) VALUES ($1, $2, 'XL-own') RETURNING id",
    [tenantId, size],
  );
  await admin.query(
    'INSERT INTO tenant.category_attributes (tenant_id, category_id, attribute_id) VALUES ($1, $2, $3)',
    [tenantId, child, fabric],
  );
  await admin.query(
    `INSERT INTO tenant.size_charts (tenant_id, category_id, table_rows) VALUES ($1, $2, '[["S","M"]]')`,
    [tenantId, parent],
  );
  const product = await one(
    `INSERT INTO tenant.products (tenant_id, name, slug, base_price, primary_category_id)
     VALUES ($1, 'Shirt', 'shirt', 500, $2) RETURNING id`,
    [tenantId, child],
  );
  await admin.query(
    'INSERT INTO tenant.product_categories (tenant_id, product_id, category_id) VALUES ($1, $2, $3)',
    [tenantId, product, child],
  );
  await admin.query(
    `INSERT INTO tenant.product_attributes (tenant_id, product_id, attribute_id, role)
     VALUES ($1, $2, $3, 'variant_defining'), ($1, $2, $4, 'informational')`,
    [tenantId, product, size, fabric],
  );
  await admin.query(
    'INSERT INTO tenant.product_attribute_values (tenant_id, product_id, attribute_id, option_id) VALUES ($1, $2, $3, $4)',
    [tenantId, product, fabric, twill],
  );
  const variant = await one(
    'INSERT INTO tenant.product_variants (tenant_id, product_id, combination_key) VALUES ($1, $2, $3) RETURNING id',
    [tenantId, product, `${size}=${large}`],
  );
  await admin.query(
    `INSERT INTO tenant.variant_attribute_values (tenant_id, product_id, variant_id, attribute_id, option_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, product, variant, size, large],
  );
  await admin.query(
    "INSERT INTO tenant.product_slug_redirects (tenant_id, old_slug, product_id) VALUES ($1, 'old-shirt', $2)",
    [tenantId, product],
  );
  // Slice 2a: stock, which makes a level and a movement the ledger otherwise never lets go of.
  await admin.query(
    `INSERT INTO tenant.stock_movements (tenant_id, product_id, variant_id, quantity_delta, reason)
     VALUES ($1, $2, $3, 5, 'initial')`,
    [tenantId, product, variant],
  );
  // Slice 3b: a serial on one of those units, which, once its unit has left, nothing but the day-60 deletion removes.
  await admin.query('UPDATE tenant.products SET serial_tracked = true WHERE id = $1', [product]);
  await admin.query(
    "INSERT INTO tenant.serial_numbers (tenant_id, variant_id, serial, status) VALUES ($1, $2, 'SEED-1', 'written_off')",
    [tenantId, variant],
  );
  // Slice 3a: a batch, which only its variant's deletion or the day-60 deletion may remove.
  await admin.query('INSERT INTO tenant.stock_batches (tenant_id, variant_id) VALUES ($1, $2)', [
    tenantId,
    variant,
  ]);
  // Slice 2b: a stock check and the line it counted; Slice 11.9: its number, and the counter that gave it.
  await admin.query(
    'INSERT INTO tenant.stock_check_counters (tenant_id, last_number) VALUES ($1, 1)',
    [tenantId],
  );
  const check = await admin.query<{ id: string }>(
    'INSERT INTO tenant.stock_checks (tenant_id, number) VALUES ($1, 1) RETURNING id',
    [tenantId],
  );
  await admin.query(
    `INSERT INTO tenant.stock_check_lines (tenant_id, check_id, product_id, variant_id, expected, counted)
     VALUES ($1, $2, $3, $4, 5, 5)`,
    [tenantId, check.rows[0]?.id, product, variant],
  );
  // Slice 4a: a supplier, the purchase counter, and a placed purchase; Slice 4b: a delivery against it, with stock
  // received on its item. Only the day-60 deletion removes a receipt, or an item with stock received on it.
  const supplier = await one(
    "INSERT INTO tenant.suppliers (tenant_id, name) VALUES ($1, 'Rahim Traders') RETURNING id",
    [tenantId],
  );
  await admin.query(
    'INSERT INTO tenant.purchase_counters (tenant_id, last_number) VALUES ($1, 1)',
    [tenantId],
  );
  const purchase = await one(
    `INSERT INTO tenant.purchase_orders (tenant_id, number, supplier_id, status, ordered_at)
     VALUES ($1, 1, $2, 'partially_received', now()) RETURNING id`,
    [tenantId, supplier],
  );
  const item = await one(
    `INSERT INTO tenant.purchase_order_lines
       (tenant_id, purchase_order_id, product_id, variant_id, position, quantity_ordered)
     VALUES ($1, $2, $3, $4, 0, 10) RETURNING id`,
    [tenantId, purchase, product, variant],
  );
  const receipt = await one(
    'INSERT INTO tenant.purchase_receipts (tenant_id, purchase_order_id) VALUES ($1, $2) RETURNING id',
    [tenantId, purchase],
  );
  const received = await admin.query<{ id: string }>(
    `INSERT INTO tenant.stock_movements
       (tenant_id, product_id, variant_id, quantity_delta, reason, unit_cost, reference_type, reference_id)
     VALUES ($1, $2, $3, 5, 'purchase_receipt', 700, 'purchase_receipt', $4) RETURNING id`,
    [tenantId, product, variant, receipt],
  );
  await admin.query(
    `INSERT INTO tenant.purchase_receipt_lines
       (tenant_id, receipt_id, purchase_line_id, quantity_accepted, unit_cost, movement_id)
     VALUES ($1, $2, $3, 5, 700, $4)`,
    [tenantId, receipt, item, received.rows[0]?.id],
  );
  // Phase 4 Slice 4.1: a customer, the day's order counter, and one of their orders with an item, its history, a call
  // and the stock it holds. Only the day-60 deletion removes a customer, an order's history or its calls.
  const customer = await one(
    "INSERT INTO tenant.customers (tenant_id, phone, name) VALUES ($1, '01711000000', 'Karim') RETURNING id",
    [tenantId],
  );
  await admin.query(
    "INSERT INTO tenant.order_counters (tenant_id, day, last_number) VALUES ($1, '2026-10-29', 1)",
    [tenantId],
  );
  const order = await one(
    `INSERT INTO tenant.orders (tenant_id, order_number, tracking_id, customer_id, customer_name, customer_phone,
       fulfilment_type, subtotal, delivery_charge, grand_total, cod_amount, due)
     VALUES ($1, '261029-0001', $2, $3, 'Karim', '01711000000', 'takeaway', 700, 0, 700, 700, 700) RETURNING id`,
    [tenantId, randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(), customer],
  );
  const orderLine = await one(
    `INSERT INTO tenant.order_lines (tenant_id, order_id, position, product_id, variant_id, product_name, stock_unit,
       list_price, unit_price, quantity, item_total, delivery_mode, delivery_charge, payment_policy)
     VALUES ($1, $2, 0, $3, $4, 'Shirt', 'piece', 700, 700, 1, 700, 'default', 0, 'none') RETURNING id`,
    [tenantId, order, product, variant],
  );
  await admin.query(
    "INSERT INTO tenant.order_status_history (tenant_id, order_id, field, new_value) VALUES ($1, $2, 'created', 'pending')",
    [tenantId, order],
  );
  await admin.query(
    "INSERT INTO tenant.order_calls (tenant_id, order_id, outcome) VALUES ($1, $2, 'no_answer')",
    [tenantId, order],
  );
  await admin.query(
    `INSERT INTO tenant.stock_reservations
       (tenant_id, order_id, order_line_id, product_id, variant_id, sold_variant_id, ordered, quantity)
     VALUES ($1, $2, $3, $4, $5, $5, 1, 1)`,
    [tenantId, order, orderLine, product, variant],
  );
  await admin.query(
    `INSERT INTO tenant.size_charts (tenant_id, product_id, table_rows) VALUES ($1, $2, '[["40"]]')`,
    [tenantId, product],
  );
  await admin.query(
    "INSERT INTO tenant.option_sets (tenant_id, name, options) VALUES ($1, 'Mine', ARRAY['A', 'B'])",
    [tenantId],
  );
  await admin.query('INSERT INTO tenant.catalogue_state (tenant_id, version) VALUES ($1, 3)', [
    tenantId,
  ]);
  const homeZone = await one(
    'INSERT INTO tenant.delivery_zones (tenant_id, is_home, charge) VALUES ($1, true, 70) RETURNING id',
    [tenantId],
  );
  await admin.query(
    'INSERT INTO tenant.delivery_zones (tenant_id, is_fallback, charge) VALUES ($1, true, 130)',
    [tenantId],
  );
  await admin.query(
    "INSERT INTO tenant.delivery_zone_areas (tenant_id, zone_id, city_code) VALUES ($1, $2, 'dhaka')",
    [tenantId, homeZone],
  );
  await admin.query(
    'INSERT INTO tenant.product_delivery_zones (tenant_id, product_id, zone_id) VALUES ($1, $2, $3)',
    [tenantId, product, homeZone],
  );
  await admin.query(
    `INSERT INTO tenant.shop_settings (tenant_id, extra_delivery_charge_per_kg, default_payment_policy)
     VALUES ($1, 10, 'delivery_charge_only')`,
    [tenantId],
  );
}

/** Every tenant-schema table that still holds a row of the shop, by name. */
async function tablesHolding(tenantId: string): Promise<string[]> {
  const tables = await admin.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'tenant' AND column_name = 'tenant_id' ORDER BY table_name`,
  );
  const holding: string[] = [];
  for (const { table_name: table } of tables.rows) {
    const rows = await admin.query(`SELECT 1 FROM tenant.${table} WHERE tenant_id = $1 LIMIT 1`, [
      tenantId,
    ]);
    if ((rows.rowCount ?? 0) > 0) holding.push(table);
  }
  return holding;
}

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

  it("deletes the shop's Phase 3 catalogue, delivery zones and settings, leaving only the ledger and the log", async () => {
    const planId = await seedPlan((nextRank += 1));
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await seedOwner(tenantId, `018${(nextRank += 1).toString().slice(0, 8)}`);
    await seedCatalogue(tenantId);
    // KNOWN-GAPS §106: a stored reply, still within its 24 hours, goes with the shop's data.
    await admin.query(
      `INSERT INTO control.idempotency_keys (tenant_id, caller, key, path, request_hash, response_status, response_body,
         expires_at) VALUES ($1, 'user:owner', 'k1', '/orders', 'h', 201, '{"customerPhone":"01711000000"}',
         now() + interval '1 day')`,
      [tenantId],
    );
    const platformBefore = await admin.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM tenant.attributes WHERE tenant_id IS NULL',
    );
    const periodEnd = new Date(Date.now() - 61 * DAY_MS);
    await activateTenant(tenantId, planId, TenantState.Archived, periodEnd, true);

    await lifecycle.runTick(new Date());

    expect((await tenantRow(tenantId))?.state).toBe(TenantState.Deleted);
    // Every tenant table with the shop's rows, beyond the two LIF-19 and LIF-20 keep: the balance ledger, and the
    // activity log, which the application role cannot delete from (AUD-03; KNOWN-GAPS §68).
    const left = await tablesHolding(tenantId);
    expect(left.filter((table) => !['balance_ledger', 'activity_log'].includes(table))).toEqual([]);
    const keys = await admin.query('SELECT 1 FROM control.idempotency_keys WHERE tenant_id = $1', [
      tenantId,
    ]);
    expect(keys.rowCount).toBe(0);
    // The platform's own library is untouched.
    const platformAfter = await admin.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM tenant.attributes WHERE tenant_id IS NULL',
    );
    expect(platformAfter.rows[0]?.total).toBe(platformBefore.rows[0]?.total);
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

  it('warns again in a later idle period, after a qualifying activity reset the clock in between', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await seedOwner(tenantId, `019${(nextRank += 1).toString().slice(0, 8)}`);

    // A day-23 warning from a *previous* idle period, inserted directly since tenant.activity_log is
    // insert-only (AUD-03) -- a real one would carry the real wall-clock "now" at send time, so to honestly
    // represent "already sent a while ago" it has to be inserted with that past timestamp directly, not
    // produced by a real tick and backdated after the fact.
    await admin.query(
      `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
       VALUES ($1, 'system', NULL, 'deletion_warning_sent', 'success',
         '{"reason":"payg_inactivity","day":23}', now() - interval '28 days')`,
      [tenantId],
    );

    // A qualifying activity (order fee, product fee or top-up) reset the clock 24 days ago -- after that
    // old warning, so this is genuinely a new idle period, itself now also reached day 24. The tenant stays
    // pay_as_you_go throughout (unlike the subscription lapse ladder, where renewing exits the candidate
    // list entirely) -- the previous idle period's own warning must not suppress this one.
    await admin.query(
      `UPDATE control.tenants SET state = 'pay_as_you_go', period_end = NULL,
         last_activity_at = $1 WHERE id = $2`,
      [new Date(Date.now() - 24 * DAY_MS), tenantId],
    );
    await lifecycle.runTick(new Date());
    const actions = await auditActions(tenantId);
    expect(actions.filter((a) => a === AuditAction.DeletionWarningSent).length).toBe(2);

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.PayAsYouGo); // 24 days -- short of day 30's archival
  });

  it('counts the idle clock from the switch to pay-as-you-go, never from the shop creation', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await seedOwner(tenantId, `019${(nextRank += 1).toString().slice(0, 8)}`);
    const warnings = async (): Promise<number> =>
      (await auditActions(tenantId)).filter((a) => a === AuditAction.DeletionWarningSent).length;

    // Created 31 days ago; its 30-day trial converted yesterday (TRL-07), with no activity at all.
    await admin.query(
      `UPDATE control.tenants SET state = 'pay_as_you_go', period_end = NULL, last_activity_at = NULL,
         created_at = $1, period_start = $2 WHERE id = $3`,
      [new Date(Date.now() - 31 * DAY_MS), new Date(Date.now() - DAY_MS), tenantId],
    );
    await lifecycle.runTick(new Date());
    expect((await tenantRow(tenantId))?.state).toBe(TenantState.PayAsYouGo);
    expect(await warnings()).toBe(0);

    // A top-up during the trial, 40 days ago, doesn't count against the pay-as-you-go clock either.
    await admin.query('UPDATE control.tenants SET last_activity_at = $1 WHERE id = $2', [
      new Date(Date.now() - 40 * DAY_MS),
      tenantId,
    ]);
    await lifecycle.runTick(new Date());
    expect((await tenantRow(tenantId))?.state).toBe(TenantState.PayAsYouGo);
    expect(await warnings()).toBe(0);

    // 23 days after the switch, the warning; 30 days after, the archival.
    await admin.query('UPDATE control.tenants SET period_start = $1 WHERE id = $2', [
      new Date(Date.now() - 23 * DAY_MS),
      tenantId,
    ]);
    await lifecycle.runTick(new Date());
    expect(await warnings()).toBe(1);
    await admin.query('UPDATE control.tenants SET period_start = $1 WHERE id = $2', [
      new Date(Date.now() - 30 * DAY_MS),
      tenantId,
    ]);
    await lifecycle.runTick(new Date());
    expect((await tenantRow(tenantId))?.state).toBe(TenantState.Archived);
  });

  it('warns an idle archived shop 45 and 57 days after its archival, then deletes it at 60 (LIF-18, LIF-19)', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const phone = `019${(nextRank += 1).toString().slice(0, 8)}`;
    await seedOwner(tenantId, phone);
    const warningDays = async (): Promise<number[]> => {
      const rows = await admin.query<{ day: number }>(
        `SELECT (summary->>'day')::int AS day FROM tenant.activity_log
          WHERE tenant_id = $1 AND action = 'deletion_warning_sent' ORDER BY created_at ASC`,
        [tenantId],
      );
      return rows.rows.map((row) => row.day);
    };
    // Switched to pay-as-you-go 75 days ago and idle since: archived at day 30, so 45 days archived now.
    const switchedAgo = async (days: number): Promise<void> => {
      await admin.query('UPDATE control.tenants SET period_start = $1 WHERE id = $2', [
        new Date(Date.now() - days * DAY_MS),
        tenantId,
      ]);
    };
    await admin.query(
      `UPDATE control.tenants SET state = 'archived', period_end = NULL, balance_frozen = true,
         last_activity_at = NULL WHERE id = $1`,
      [tenantId],
    );
    await switchedAgo(75);

    await lifecycle.runTick(new Date());
    await lifecycle.runTick(new Date()); // same day again -- must not repeat
    expect(await warningDays()).toEqual([45]);
    expect((await tenantRow(tenantId))?.state).toBe(TenantState.Archived);

    await switchedAgo(87);
    await lifecycle.runTick(new Date());
    expect(await warningDays()).toEqual([45, 57]);
    const texted = await admin.query('SELECT 1 FROM control.sms_outbox WHERE to_phone = $1', [
      phone,
    ]);
    expect(texted.rowCount).toBe(2);

    await switchedAgo(90);
    await lifecycle.runTick(new Date());
    expect((await tenantRow(tenantId))?.state).toBe(TenantState.Deleted);
  });
});

describeIfDatabase('LIF-01: cancel and undo', () => {
  it('audits the cancellation and the undo', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');

    await lifecycle.cancelSubscription(tenantId, '203.0.113.7');
    await lifecycle.undoCancellation(tenantId);

    const actions = await auditActions(tenantId);
    expect(actions).toContain(AuditAction.SubscriptionCancelled);
    expect(actions).toContain(AuditAction.SubscriptionCancellationUndone);

    // AUD-02's broader retrofit: cancel/undo now thread the caller's own ip through to the audit row.
    const rows = await admin.query<{ action: AuditAction; ip: string | null }>(
      'SELECT action, ip FROM tenant.activity_log WHERE tenant_id = $1 ORDER BY created_at ASC',
      [tenantId],
    );
    const cancelled = rows.rows.find((r) => r.action === AuditAction.SubscriptionCancelled);
    expect(cancelled?.ip).toBe('203.0.113.7');
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

  it('TRM-04: with the toggle on but the term now retired, falls through to the normal lapse', async () => {
    const planId = await seedPlan((nextRank += 1));
    const termId = await seedTermAndPrice(planId, '199.00');
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await activateTenant(tenantId, planId, TenantState.Active, new Date(Date.now() - DAY_MS));
    await setAutoRenewFields(tenantId, termId, true);
    await balance.creditStandalone({ tenantId, amount: '500.00', type: LedgerEntryType.TopUp });
    await admin.query('UPDATE control.billing_terms SET retired_at = now() WHERE id = $1', [
      termId,
    ]);

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
      `UPDATE control.tenants SET plan_id = $1, plan_snapshot = (SELECT limits FROM control.plans WHERE id = $1),
         contact_phone = '01711111111', contact_email = 'owner@example.com',
         business_address = '123 Main Road', suspended_reason = 'past policy note',
         kyc_status = 'verified'
       WHERE id = $2`,
      [planId, tenantId],
    );
    await seedBalance(admin, tenantId, '250.00');
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

describeIfDatabase("LIF-24: the operator's shop search", () => {
  it('matches a typed % or _ as itself, never as a wildcard', async () => {
    const summaries = app.get(TenantSummaries);
    await seedShop(admin, '100% Cotton', freshSlug());
    await seedShop(admin, '100 Cotton', freshSlug());
    await seedShop(admin, 'A_B Traders', freshSlug());
    await seedShop(admin, 'AXB Traders', freshSlug());
    const names = async (query: string): Promise<string[]> =>
      (await summaries.search(query, null, 50)).entries.map((row) => row.shopName);
    expect(await names('0% C')).toEqual(['100% Cotton']);
    expect(await names('a_b')).toEqual(['A_B Traders']);
    expect((await names('cotton')).sort()).toEqual(['100 Cotton', '100% Cotton']);
  });
});

describeIfDatabase('LIF-24: operator suspend and restore', () => {
  it('freezes on suspend and unfreezes on restore when not independently lapsed', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');

    const operatorId = randomUUID();
    await lifecycle.suspend(tenantId, 'policy violation', operatorId, '203.0.113.9');
    let tenant = await tenantRow(tenantId);
    expect(tenant?.balance_frozen).toBe(true);
    const suspended = await admin.query<{ suspended_at: Date | null }>(
      'SELECT suspended_at FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    expect(suspended.rows[0]?.suspended_at).not.toBeNull();

    // AUD-02's broader retrofit: an operator action now threads its own ip through too, on both the
    // tenant's own log and the platform log (previously ip: null on both, unconditionally).
    const suspendEntry = await admin.query<{ ip: string | null }>(
      `SELECT ip FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'tenant_suspended'`,
      [tenantId],
    );
    expect(suspendEntry.rows[0]?.ip).toBe('203.0.113.9');

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

describeIfDatabase(
  'TEN-27: the host-to-tenant cache is invalidated, not left to its own 60s TTL',
  () => {
    it('suspend and restore both invalidate immediately', async () => {
      const slug = freshSlug();
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, slug, 'active');
      const host = `${slug}.localhost`;

      const beforeSuspend = await resolver.resolve(host);
      expect(beforeSuspend.outcome).toBe('tenant'); // warms the cache while still open

      await lifecycle.suspend(tenantId, 'policy violation', randomUUID());
      const afterSuspend = await resolver.resolve(host);
      // Without TEN-27's fix this would still read the cached, pre-suspension entry for up to 60s.
      expect(afterSuspend.outcome).toBe('closed');

      await lifecycle.restore(tenantId, randomUUID());
      const afterRestore = await resolver.resolve(host);
      expect(afterRestore.outcome).toBe('tenant');
    });

    it("the lapse ladder's own archival invalidates immediately", async () => {
      const planId = await seedPlan((nextRank += 1));
      const slug = freshSlug();
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, slug, 'trial');
      const host = `${slug}.localhost`;
      // Already past the archived threshold (grace 3 + read_only 4 + locked 8 = 15 days), but `state` is
      // still `active` -- exactly "a tick hasn't run yet", the same fixture LIF-04's own tests use.
      await activateTenant(
        tenantId,
        planId,
        TenantState.Active,
        new Date(Date.now() - 20 * DAY_MS),
      );

      const beforeTick = await resolver.resolve(host);
      expect(beforeTick.outcome).toBe('tenant'); // warms the cache while the row still says `active`

      await lifecycle.runTick(new Date());
      const afterTick = await resolver.resolve(host);
      // Without TEN-27's fix this would still read the cached, pre-archival `active` entry.
      expect(afterTick.outcome).toBe('closed');
    });

    it("PYG-21's own archival pass invalidates immediately", async () => {
      const slug = freshSlug();
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, slug, 'trial');
      const host = `${slug}.localhost`;
      await admin.query(
        `UPDATE control.tenants SET state = 'pay_as_you_go', period_end = NULL,
         last_activity_at = $1 WHERE id = $2`,
        [new Date(Date.now() - 30 * DAY_MS), tenantId],
      );

      const beforeTick = await resolver.resolve(host);
      expect(beforeTick.outcome).toBe('tenant');

      await lifecycle.runTick(new Date());
      const afterTick = await resolver.resolve(host);
      expect(afterTick.outcome).toBe('closed');
    });
  },
);

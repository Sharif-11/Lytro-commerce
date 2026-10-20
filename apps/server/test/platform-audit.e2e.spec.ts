import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttributeDataType, PlatformSettingKey, RateKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { RateService } from '../src/modules/balance/services/rate.service';
import { PlatformWalletsService } from '../src/modules/balance/services/platform-wallets.service';
import { BillingTermsService } from '../src/modules/billing/services/billing-terms.service';
import { LifecycleService } from '../src/modules/billing/services/lifecycle.service';
import { PlanAssignmentService } from '../src/modules/billing/services/plan-assignment.service';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import { PlansService } from '../src/modules/billing/services/plans.service';
import { PlatformLibraryService } from '../src/modules/catalogue/services/platform-library.service';
import { OperatorAuthService } from '../src/modules/operator/services/operator-auth.service';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { postJson } from './support/http';
import { SmsCapture } from './support/sms-capture';

// ADM-08 (KNOWN-GAPS §70): every operator action and its platform audit entry commit together or not at all. Each
// case makes the platform log refuse that one action's entry, the way a crash or a dropped connection would lose it,
// and checks the action left nothing behind; the actions that wrote no entry at all before (plans, a billing term
// deleted, plan prices) are checked to write one now. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_platform_audit_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const PASSWORD = 'operator-pass-2468';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const operator = { operatorId: randomUUID(), ip: '203.0.113.7' };

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'platform-audit-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  await admin.query(
    `CREATE FUNCTION public.refuse_audit() RETURNS trigger LANGUAGE plpgsql
     AS $$ BEGIN RAISE EXCEPTION 'audit write lost'; END $$`,
  );
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** Runs `work` while the platform log refuses `action`'s entry; the work must fail with it. */
async function refused(action: string, work: () => Promise<unknown>): Promise<void> {
  await admin.query(
    `CREATE TRIGGER refuse_audit BEFORE INSERT ON control.platform_audit_log
     FOR EACH ROW WHEN (NEW.action = '${action}') EXECUTE FUNCTION public.refuse_audit()`,
  );
  try {
    await expect(work()).rejects.toThrow(/audit write lost/);
  } finally {
    await admin.query('DROP TRIGGER refuse_audit ON control.platform_audit_log');
  }
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const result = await admin.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, params);
  return result.rows[0]?.n ?? 0;
}

async function entries(action: string): Promise<{ actor_id: string; summary: unknown }[]> {
  const result = await admin.query<{ actor_id: string; summary: unknown }>(
    'SELECT actor_id, summary FROM control.platform_audit_log WHERE action = $1 ORDER BY created_at',
    [action],
  );
  return result.rows;
}

const freshSlug = (): string => `pa${randomUUID().replace(/-/g, '').slice(0, 10)}`;

async function plan(name: string): Promise<string> {
  const created = await app.get(PlansService).create(
    {
      name,
      description: null,
      rank: 500 + Math.floor(Math.random() * 100_000),
      forSale: false,
      limits: { staff: 1, products: 10 },
      features: {},
    },
    operator,
  );
  return created.id;
}

describeIfDatabase('every operator action commits with its platform audit entry (ADM-08)', () => {
  it('a rate change, with its history row', async () => {
    const rates = app.get(RateService);
    const before = (await rates.current(RateKey.SmsPerUnit))?.value;
    const history = await count('control.rate_history');
    await refused('rate_changed', () =>
      rates.change(RateKey.SmsPerUnit, '9.99', operator.operatorId, null),
    );
    const stored = await admin.query<{ value: string }>(
      'SELECT value::text FROM control.rates WHERE key = $1',
      [RateKey.SmsPerUnit],
    );
    expect(stored.rows[0]?.value).toBe(before);
    expect(await count('control.rate_history')).toBe(history);
  });

  it('a platform setting', async () => {
    const settings = app.get(PlatformSettingsService);
    const before = await admin.query<{ value: unknown }>(
      'SELECT value FROM control.platform_settings WHERE key = $1',
      [PlatformSettingKey.TrialDays],
    );
    await refused('settings_changed', () =>
      settings.set(PlatformSettingKey.TrialDays, 99, operator.operatorId),
    );
    const after = await admin.query<{ value: unknown }>(
      'SELECT value FROM control.platform_settings WHERE key = $1',
      [PlatformSettingKey.TrialDays],
    );
    expect(after.rows[0]?.value).toEqual(before.rows[0]?.value);
    expect((await settings.current(PlatformSettingKey.TrialDays))?.value).toEqual(
      before.rows[0]?.value,
    );
  });

  it('a platform wallet added, changed and removed', async () => {
    const wallets = app.get(PlatformWalletsService);
    const values = {
      provider: 'bkash',
      number: '01700000001',
      label: null,
      enabled: true,
      displayOrder: 9,
    };
    await refused('platform_wallet_added', () => wallets.create(values, operator.operatorId));
    expect(await count("control.platform_wallets WHERE number = '01700000001'")).toBe(0);
    const wallet = await wallets.create(values, operator.operatorId);
    await refused('platform_wallet_updated', () =>
      wallets.update(wallet.id, { label: 'Changed' }, operator.operatorId),
    );
    expect(
      await count('control.platform_wallets WHERE id = $1 AND label IS NULL', [wallet.id]),
    ).toBe(1);
    await refused('platform_wallet_removed', () => wallets.remove(wallet.id, operator.operatorId));
    expect(await count('control.platform_wallets WHERE id = $1', [wallet.id])).toBe(1);
  });

  it('a billing term created, changed, retired and deleted; a plan price set and removed', async () => {
    const terms = app.get(BillingTermsService);
    const values = {
      labelBn: 'চার মাস',
      labelEn: 'Four months',
      months: 4,
      visible: false,
      displayOrder: 40,
      defaultDiscountPct: null,
      tenantId: null,
    };
    await refused('billing_term_created', () => terms.create(values, operator.operatorId));
    expect(await count("control.billing_terms WHERE label_en = 'Four months'")).toBe(0);
    const term = await terms.create(values, operator.operatorId);
    await refused('billing_term_updated', () =>
      terms.update(term.id, { labelEn: 'Changed' }, operator.operatorId),
    );
    await refused('billing_term_retired', () => terms.retire(term.id, operator.operatorId));
    expect(
      await count(
        "control.billing_terms WHERE id = $1 AND label_en = 'Four months' AND retired_at IS NULL",
        [term.id],
      ),
    ).toBe(1);

    const planId = await plan(`Priced ${freshSlug()}`);
    await refused('plan_price_set', () =>
      terms.setPrice(planId, term.id, '500.00', operator.operatorId),
    );
    expect(await count('control.plan_prices WHERE plan_id = $1', [planId])).toBe(0);
    await terms.setPrice(planId, term.id, '500.00', operator.operatorId, operator.ip);
    await refused('plan_price_removed', () =>
      terms.removePrice(planId, term.id, operator.operatorId),
    );
    expect(await count('control.plan_prices WHERE plan_id = $1', [planId])).toBe(1);
    await terms.removePrice(planId, term.id, operator.operatorId, operator.ip);
    expect((await entries('plan_price_set')).at(-1)).toMatchObject({
      actor_id: operator.operatorId,
      summary: { billingTermId: term.id, oldValue: null, newValue: '500.00' },
    });
    expect((await entries('plan_price_removed')).at(-1)?.summary).toMatchObject({
      oldValue: '500.00',
    });

    await refused('billing_term_deleted', () => terms.delete(term.id, operator.operatorId));
    expect(await count('control.billing_terms WHERE id = $1', [term.id])).toBe(1);
    await terms.delete(term.id, operator.operatorId, operator.ip);
    expect(await count('control.billing_terms WHERE id = $1', [term.id])).toBe(0);
    expect((await entries('billing_term_deleted')).at(-1)).toMatchObject({
      actor_id: operator.operatorId,
      summary: { oldValue: { labelEn: 'Four months', months: 4 } },
    });
  });

  it('a plan created, changed and deleted, each now in the platform log', async () => {
    const plans = app.get(PlansService);
    const name = `Audited ${freshSlug()}`;
    const values = {
      name,
      description: null,
      rank: 900_000 + Math.floor(Math.random() * 1000),
      forSale: false,
      limits: { staff: 1, products: 10 },
      features: {},
    };
    await refused('plan_created', () => plans.create(values, operator));
    expect(await count('control.plans WHERE name = $1', [name])).toBe(0);
    const created = await plans.create(values, operator);
    expect((await entries('plan_created')).at(-1)).toMatchObject({ actor_id: operator.operatorId });

    await refused('plan_updated', () => plans.update(created.id, { description: 'x' }, operator));
    expect(await count('control.plans WHERE id = $1 AND description IS NULL', [created.id])).toBe(
      1,
    );
    expect(await count('control.plan_versions WHERE plan_id = $1', [created.id])).toBe(0);
    await plans.update(created.id, { description: 'Now described' }, operator);
    expect((await entries('plan_updated')).at(-1)?.summary).toMatchObject({
      newValue: { description: 'Now described' },
    });

    // An edited plan keeps its prior version, so it is in use; a fresh one can be deleted.
    const spare = await plans.create(
      { ...values, name: `Spare ${name}`, rank: values.rank + 1 },
      operator,
    );
    await refused('plan_deleted', () => plans.delete(spare.id, operator));
    expect(await count('control.plans WHERE id = $1', [spare.id])).toBe(1);
    await plans.delete(spare.id, operator);
    expect((await entries('plan_deleted')).at(-1)).toMatchObject({
      actor_id: operator.operatorId,
      summary: { oldValue: { name: `Spare ${name}` } },
    });
  });

  it('a plan assigned, with the shop untouched when it fails', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const planId = await plan(`Assigned ${freshSlug()}`);
    const before = await admin.query<{ plan_id: string | null }>(
      'SELECT plan_id FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    await refused('plan_assigned', () =>
      app.get(PlanAssignmentService).assign({
        tenantId,
        planId,
        expiry: null,
        reason: 'launch partner',
        operatorId: operator.operatorId,
        ip: operator.ip,
      }),
    );
    expect(await count('control.plan_assignments WHERE tenant_id = $1', [tenantId])).toBe(0);
    const after = await admin.query<{ plan_id: string | null }>(
      'SELECT plan_id FROM control.tenants WHERE id = $1',
      [tenantId],
    );
    expect(after.rows[0]?.plan_id).toBe(before.rows[0]?.plan_id);
    expect(
      await count("tenant.activity_log WHERE tenant_id = $1 AND action = 'plan_assigned'", [
        tenantId,
      ]),
    ).toBe(0);
  });

  it('a limit override set and removed, a shop suspended and restored', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');
    const overrides = app.get(PlanLimitOverridesService);
    await refused('plan_limit_override_set', () =>
      overrides.set(tenantId, 'products', 500, 'launch week', operator.operatorId),
    );
    expect(await count('control.plan_limit_overrides WHERE tenant_id = $1', [tenantId])).toBe(0);
    await overrides.set(tenantId, 'products', 500, 'launch week', operator.operatorId);
    await refused('plan_limit_override_removed', () =>
      overrides.remove(tenantId, 'products', operator.operatorId),
    );
    expect(await count('control.plan_limit_overrides WHERE tenant_id = $1', [tenantId])).toBe(1);

    const lifecycle = app.get(LifecycleService);
    await refused('tenant_suspended', () =>
      lifecycle.suspend(tenantId, 'policy', operator.operatorId, operator.ip),
    );
    expect(await count('control.tenants WHERE id = $1 AND suspended_at IS NULL', [tenantId])).toBe(
      1,
    );
    await lifecycle.suspend(tenantId, 'policy', operator.operatorId, operator.ip);
    await refused('tenant_restored', () =>
      lifecycle.restore(tenantId, operator.operatorId, operator.ip),
    );
    expect(
      await count('control.tenants WHERE id = $1 AND suspended_at IS NOT NULL', [tenantId]),
    ).toBe(1);
  });

  it('the platform library: a preset, an attribute, an option and an option set', async () => {
    const library = app.get(PlatformLibraryService);
    const before = await admin.query<{ default_low_stock: string }>(
      "SELECT default_low_stock::text FROM control.business_type_presets WHERE key = 'grocery'",
    );
    await refused('preset_updated', () =>
      library.updatePreset('grocery', { defaultLowStock: 77 }, operator),
    );
    const after = await admin.query<{ default_low_stock: string }>(
      "SELECT default_low_stock::text FROM control.business_type_presets WHERE key = 'grocery'",
    );
    expect(after.rows[0]?.default_low_stock).toBe(before.rows[0]?.default_low_stock);

    const name = `Gloss ${freshSlug()}`;
    await refused('platform_attribute_created', () =>
      library.createAttribute({ name, dataType: AttributeDataType.EnumSingle }, operator),
    );
    expect(await count('tenant.attributes WHERE name = $1', [name])).toBe(0);
    const attribute = await library.createAttribute(
      { name, dataType: AttributeDataType.EnumSingle },
      operator,
    );
    await refused('platform_option_created', () =>
      library.addOption(attribute.id, { value: 'Matte' }, operator),
    );
    expect(await count('tenant.attribute_options WHERE attribute_id = $1', [attribute.id])).toBe(0);

    const set = await library.createOptionSet(
      { name: `Set ${freshSlug()}`, options: ['A'] },
      operator,
    );
    await refused('platform_option_set_deleted', () => library.deleteOptionSet(set.id, operator));
    expect(await count('tenant.option_sets WHERE id = $1', [set.id])).toBe(1);
  });

  it("an operator's backup codes regenerated", async () => {
    const email = `ops-${freshSlug()}@lytro.test`;
    await admin.query(
      'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
      [email, await hash(PASSWORD, 12)],
    );
    const signedIn = await postJson(port, '/auth/operator/signin', { email, password: PASSWORD });
    const { secret } = signedIn.body as { secret: string };
    const enrolled = await postJson(port, '/auth/operator/enroll', {
      email,
      password: PASSWORD,
      code: await generate({ secret }),
    });
    expect(enrolled.status, JSON.stringify(enrolled.body)).toBe(200);
    const account = await admin.query<{ id: string }>(
      'SELECT id FROM control.operator_accounts WHERE email = $1',
      [email],
    );
    const operatorId = account.rows[0]?.id ?? '';
    const codesOf = async (): Promise<string[]> =>
      (
        await admin.query<{ id: string }>(
          'SELECT id FROM control.operator_backup_codes WHERE operator_id = $1 ORDER BY id',
          [operatorId],
        )
      ).rows.map((row) => row.id);
    const before = await codesOf();
    expect(before.length).toBeGreaterThan(0);
    await refused('backup_codes_regenerated', async () =>
      app
        .get(OperatorAuthService)
        .regenerateBackupCodes(operatorId, PASSWORD, await generate({ secret })),
    );
    expect(await codesOf()).toEqual(before);
  }, 60_000);
});

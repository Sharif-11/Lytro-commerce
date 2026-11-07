import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BillingInfoRow } from '@lytronix/db';
import { AddonKind, LedgerEntryType, TenantState } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { AddonRenewalService } from '../src/modules/billing/services/addon-renewal.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { TenantCache } from '../src/modules/tenancy/services/tenant-cache';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// PLN-20, D7-64 (KNOWN-GAPS §131, the owner's answers 2026-11-07): the reads allowance gives 200 reads for each month
// paid for, prorated exactly as its price, in one pool; it renews with the plan and never runs on into a period of its
// own. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_allowance_term_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

let app: INestApplication;
let port: number;
let admin: pg.Client;
let planId = '';
let monthId = '';
let sixMonthsId = '';
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'allowance-term-e2e-otp-secret-0123456789012';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  planId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ('Allowance term', 961, true, $1) RETURNING id`,
        [JSON.stringify({ products: 100, staff: 3, storage_mb: 100 })],
      )
    ).rows[0]?.id ?? '';
  const term = async (label: string, months: number, price: number): Promise<string> => {
    const id =
      (
        await admin.query<{ id: string }>(
          `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
           VALUES ($1, $1, $2, true, $2) RETURNING id`,
          [label, months],
        )
      ).rows[0]?.id ?? '';
    await admin.query(
      'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
      [planId, id, price],
    );
    return id;
  };
  monthId = await term('Allowance month', 1, 300);
  sixMonthsId = await term('Allowance six months', 6, 1800);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface AllowanceRow {
  id: string;
  unit_size: number;
  quantity: number;
  price: string;
  continues_id: string | null;
  status: string;
}

async function onPaidPlan(balance: string, termId: string): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'allow');
  await app.get(BalanceService).creditStandalone({
    tenantId: shop.tenantId,
    amount: balance,
    type: LedgerEntryType.TopUp,
  });
  const purchase = app.get(PurchaseService);
  const quote = await purchase.quote(shop.tenantId, planId, termId);
  await purchase.confirmFromBalance(quote.id, shop.tenantId);
  return shop;
}

async function allowanceId(): Promise<string> {
  return (
    (
      await admin.query<{ id: string }>(
        "SELECT id FROM control.addons WHERE key = 'address_reads_200'",
      )
    ).rows[0]?.id ?? ''
  );
}

async function buyAllowance(shop: ShopClient): Promise<void> {
  const quote = await shop.post('/addons/quote', { addonId: await allowanceId(), quantity: 1 });
  expect(quote.status, JSON.stringify(quote.body)).toBe(201);
  const paymentId = (quote.body as { payment: { id: string } }).payment.id;
  const bought = await shop.post('/addons/purchase', { paymentId });
  expect(bought.status, JSON.stringify(bought.body)).toBe(201);
}

async function allowancesOf(shop: ShopClient): Promise<AllowanceRow[]> {
  return (
    await admin.query<AllowanceRow>(
      `SELECT id, unit_size, quantity, price::text AS price, continues_id, status
       FROM control.addon_purchases WHERE tenant_id = $1 AND kind = 'allowance' ORDER BY purchased_at, id`,
      [shop.tenantId],
    )
  ).rows;
}

describeIfDatabase('how many reads an allowance gives (PLN-20, D7-64)', () => {
  it('gives 200 reads for each month a whole term pays for: 1,200 for ৳120 on six months', async () => {
    const shop = await onPaidPlan('2000.00', sixMonthsId);
    await buyAllowance(shop);
    const [row] = await allowancesOf(shop);
    expect(row).toMatchObject({ price: '120.00', unit_size: 1_200, quantity: 1 });
  });

  it('prorates the reads exactly as the price when part of the period has gone', async () => {
    const shop = await onPaidPlan('400.00', monthId);
    // Half of a now 60-day period gone: half the month's price, half the month's reads.
    await admin.query(
      "UPDATE control.tenants SET period_start = period_start - interval '30 days' WHERE id = $1",
      [shop.tenantId],
    );
    app.get(TenantCache).invalidateTenant(shop.tenantId);
    await buyAllowance(shop);
    const [row] = await allowancesOf(shop);
    expect(row).toMatchObject({ price: '10.00', unit_size: 100 });
  });
});

describeIfDatabase('renewing an allowance (PLN-20, D7-64)', () => {
  it('says it renews with the plan, not that the plan leaves it nothing to raise', async () => {
    const shop = await onPaidPlan('400.00', monthId);
    await buyAllowance(shop);
    const mine = (await shop.get('/addons/mine')).body as {
      addons: { key: string; renewal: string }[];
    };
    expect(mine.addons.find((addon) => addon.key === 'address_reads_200')?.renewal).toBe(
      'with_plan',
    );
  });

  it("is carried by the plan's renewal, with the new term's reads at the catalogue's price", async () => {
    const shop = await onPaidPlan('4000.00', sixMonthsId);
    await buyAllowance(shop);
    const [first] = await allowancesOf(shop);
    const renewal = await shop.post('/billing/quote', { planId, billingTermId: sixMonthsId });
    expect(renewal.status, JSON.stringify(renewal.body)).toBe(201);
    const payment = renewal.body as { id: string; kind: string; amount: string };
    // 1,800 for the plan and 120 for six months of the allowance.
    expect(payment).toMatchObject({ kind: 'renewal', amount: '1920.00' });
    const paid = await shop.post('/billing/purchase', { paymentId: payment.id, method: 'balance' });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    const rows = await allowancesOf(shop);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id !== first?.id)).toMatchObject({
      continues_id: first?.id,
      price: '120.00',
      unit_size: 1_200,
      status: 'active',
    });
  });

  it('never runs on into a period of its own, as a limit does on pay-as-you-go', async () => {
    const renewals = app.get(AddonRenewalService);
    const payAsYouGo = {
      state: TenantState.PayAsYouGo,
      periodStart: null,
      periodEnd: null,
      billingTermId: null,
    } as unknown as BillingInfoRow;
    const now = new Date();
    const ending = { expiresAt: now, price: '20', quantity: 1 };
    expect(
      await renewals.nextOwnPeriod(payAsYouGo, { ...ending, kind: AddonKind.Allowance }, now),
    ).toBeNull();
    expect(
      await renewals.nextOwnPeriod(payAsYouGo, { ...ending, kind: AddonKind.Limit }, now),
    ).not.toBeNull();
  });
});

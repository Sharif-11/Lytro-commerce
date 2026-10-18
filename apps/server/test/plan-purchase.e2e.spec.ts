import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType, PlanPaymentStatus, TenantState } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { PaymentQueueService } from '../src/modules/billing/services/payment-queue.service';
import { PlanPaymentsService } from '../src/modules/payments/services/plan-payments.service';
import { InvoicesService } from '../src/modules/payments/services/invoices.service';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { TopUpService } from '../src/modules/balance/services/top-up.service';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedShop } from './support/database';
import { SmsCapture } from './support/sms-capture';

// Phase 2 slice 4: plan purchase, top-up and invoices (BIL-01 to BIL-18, BAL-03 to BAL-06). White-box, same
// pattern as slice 3's trial-lifecycle spec -- services are called directly, not through HTTP, since the
// operator/tenant session flows are already covered by other specs and this slice's own risk is the money
// math and the state machine, not request plumbing.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_plan_purchase_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let admin: pg.Client;
let purchase: PurchaseService;
let queue: PaymentQueueService;
let planPayments: PlanPaymentsService;
let invoices: InvoicesService;
let balance: BalanceService;
let topUp: TopUpService;
let idempotency: IdempotencyService;
const texts = new SmsCapture();

const freshSlug = (): string => `t${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const operatorId = (): string => randomUUID();

async function seedPlanAndTerm(
  months: number,
  price: string,
): Promise<{ planId: string; termId: string }> {
  const plan = await admin.query<{ id: string }>(
    `INSERT INTO control.plans (name, rank, for_sale, version, limits, features)
     VALUES ($1, $2, true, 1, '{}', '{}') RETURNING id`,
    [`Test Plan ${freshSlug()}`, Math.floor(Math.random() * 100000) + 1000],
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
    period_end: Date | null;
    balance_amount: string;
  }>('SELECT state, plan_id, period_end, balance_amount FROM control.tenants WHERE id = $1', [
    tenantId,
  ]);
  return row.rows[0];
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'plan-purchase-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app } = await listenOn(moduleRef));
  purchase = app.get(PurchaseService);
  queue = app.get(PaymentQueueService);
  planPayments = app.get(PlanPaymentsService);
  invoices = app.get(InvoicesService);
  balance = app.get(BalanceService);
  topUp = app.get(TopUpService);
  idempotency = app.get(IdempotencyService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('plan purchase from balance (BIL-01, BIL-05, BIL-08, BIL-12)', () => {
  it('BIL-08: pays from balance atomically and activates the plan with a gap-free invoice number', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await balance.creditStandalone({ tenantId, amount: '1000.00', type: LedgerEntryType.TopUp });

    const { planId, termId } = await seedPlanAndTerm(1, '449.00');
    const quote = await purchase.quote(tenantId, planId, termId);
    expect(quote.amount).toBe('449.00');
    expect(quote.status).toBe(PlanPaymentStatus.Pending);

    const result = await purchase.confirmFromBalance(quote.id, tenantId);
    expect(result.payment.status).toBe(PlanPaymentStatus.Verified);
    expect(result.invoice).not.toBeNull();
    expect(result.invoice?.amount).toBe('449.00');

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe(TenantState.Active);
    expect(tenant?.plan_id).toBe(planId);
    expect(tenant?.balance_amount).toBe('551.00');

    const list = await invoices.listForTenant(tenantId);
    expect(list.some((inv) => inv.id === result.invoice?.id)).toBe(true);
  });

  it("PLN-05: the purchase snapshot also freezes the plan's version and features, immune to a later edit", async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await balance.creditStandalone({ tenantId, amount: '1000.00', type: LedgerEntryType.TopUp });
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');

    const quote = await purchase.quote(tenantId, planId, termId);
    await purchase.confirmFromBalance(quote.id, tenantId);

    const snapshotRow = async () =>
      (
        await admin.query<{ plan_version_snapshot: number; feature_snapshot: unknown }>(
          'SELECT plan_version_snapshot, feature_snapshot FROM control.tenants WHERE id = $1',
          [tenantId],
        )
      ).rows[0];

    expect(await snapshotRow()).toEqual({ plan_version_snapshot: 1, feature_snapshot: {} });

    // The operator edits the live plan afterward -- a new version, a feature switched on.
    await admin.query(
      `UPDATE control.plans SET version = 2, features = '{"betaDashboard": true}' WHERE id = $1`,
      [planId],
    );

    // The already-completed purchase's own snapshot must not drift with it.
    expect(await snapshotRow()).toEqual({ plan_version_snapshot: 1, feature_snapshot: {} });
  });

  it('BIL-08: refuses a balance payment the balance cannot cover', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');
    const quote = await purchase.quote(tenantId, planId, termId);
    await expect(purchase.confirmFromBalance(quote.id, tenantId)).rejects.toMatchObject({
      code: 'quota_exceeded',
    });
  });

  it('DAT-07/BIL-12: two confirmed purchases get consecutive, gap-free invoice numbers', async () => {
    const tenantA = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const tenantB = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await balance.creditStandalone({
      tenantId: tenantA,
      amount: '1000.00',
      type: LedgerEntryType.TopUp,
    });
    await balance.creditStandalone({
      tenantId: tenantB,
      amount: '1000.00',
      type: LedgerEntryType.TopUp,
    });
    const { planId, termId } = await seedPlanAndTerm(1, '100.00');

    const quoteA = await purchase.quote(tenantA, planId, termId);
    const resultA = await purchase.confirmFromBalance(quoteA.id, tenantA);
    const quoteB = await purchase.quote(tenantB, planId, termId);
    const resultB = await purchase.confirmFromBalance(quoteB.id, tenantB);

    expect(resultB.invoice?.number).toBe((resultA.invoice?.number ?? 0) + 1);
  });
});

async function seedOwnerContact(tenantId: string): Promise<{ phone: string; email: string }> {
  const phone = `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;
  const email = `${freshSlug()}@example.com`;
  await admin.query(
    `INSERT INTO tenant.users (tenant_id, phone, email, name, is_owner, active)
     VALUES ($1, $2, $3, 'Rahima Akter', true, true)`,
    [tenantId, phone, email],
  );
  return { phone, email };
}

async function invoiceRow(invoiceId: string) {
  const row = await admin.query<{
    shop_name: string | null;
    owner_name: string | null;
    plan_name: string | null;
    plan_version: number | null;
    period_start: Date | null;
    period_end: Date | null;
    discount_amount: string;
    payment_method: string | null;
    payment_reference: string | null;
  }>(
    `SELECT shop_name, owner_name, plan_name, plan_version, period_start, period_end, discount_amount,
            payment_method, payment_reference
     FROM control.invoices WHERE id = $1`,
    [invoiceId],
  );
  return row.rows[0];
}

describeIfDatabase('BIL-12, BIL-05: what an invoice states, and the plan-active notice', () => {
  it('a balance purchase states shop, owner, plan, period, the term discount and the payment method', async () => {
    const shopName = `Shop ${freshSlug()}`;
    const tenantId = await seedShop(admin, shopName, freshSlug(), 'trial');
    const { phone, email } = await seedOwnerContact(tenantId);
    await balance.creditStandalone({ tenantId, amount: '5000.00', type: LedgerEntryType.TopUp });
    const { planId } = await seedPlanAndTerm(1, '449.00');
    const yearTerm = await admin.query<{ id: string }>(
      `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
       VALUES ('বছর', '12-month', 12, true, 1) RETURNING id`,
    );
    const yearTermId = yearTerm.rows[0]?.id ?? '';
    await admin.query(
      'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
      [planId, yearTermId, '4741.00'],
    );
    const plan = await admin.query<{ name: string }>(
      'SELECT name FROM control.plans WHERE id = $1',
      [planId],
    );

    const quote = await purchase.quote(tenantId, planId, yearTermId);
    const result = await purchase.confirmFromBalance(quote.id, tenantId);
    const invoiceId = result.invoice?.id ?? '';
    const tenant = await admin.query<{ period_start: Date; period_end: Date }>(
      'SELECT period_start, period_end FROM control.tenants WHERE id = $1',
      [tenantId],
    );

    expect(await invoiceRow(invoiceId)).toEqual({
      shop_name: shopName,
      owner_name: 'Rahima Akter',
      plan_name: plan.rows[0]?.name,
      plan_version: 1,
      period_start: tenant.rows[0]?.period_start,
      period_end: tenant.rows[0]?.period_end,
      // TRM-12: 12 months at the 1-month rate is 5,388; the 12-month price is 4,741.
      discount_amount: '647.00',
      payment_method: 'balance',
      payment_reference: null,
    });

    // BIL-05: the owner hears the plan is active, by SMS and email, naming the invoice.
    const number = String(result.invoice?.number);
    const sms = await admin.query<{ body: string }>(
      'SELECT body FROM control.sms_outbox WHERE to_phone = $1',
      [phone],
    );
    expect(sms.rows.map((row) => row.body).join(' ')).toContain(`Invoice #${number}`);
    const mails = await admin.query<{ subject: string; body: string }>(
      `SELECT subject, body FROM control.mail_outbox WHERE to_email = $1 AND kind = 'lifecycle_notice'`,
      [email],
    );
    expect(mails.rows).toHaveLength(1);
    expect(mails.rows[0]?.subject).toBe('Your plan is active');
    expect(mails.rows[0]?.body).toContain(`Invoice #${number}, 4741.00 TK`);
  });

  it('the shortest term itself carries no discount', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await balance.creditStandalone({ tenantId, amount: '1000.00', type: LedgerEntryType.TopUp });
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');

    const quote = await purchase.quote(tenantId, planId, termId);
    const result = await purchase.confirmFromBalance(quote.id, tenantId);

    const invoice = await invoiceRow(result.invoice?.id ?? '');
    expect(invoice?.discount_amount).toBe('0.00');
    // No owner row on this shop -- the invoice still issues, with no owner name and no notice.
    expect(invoice?.owner_name).toBeNull();
  });

  it('a wallet payment states the transaction ID the operator verified', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');
    const quote = await purchase.quote(tenantId, planId, termId);
    const transactionId = `TXN-${randomUUID()}`;
    await purchase.submitWalletPayment(quote.id, tenantId, {
      transactionId,
      senderNumber: '01710000000',
      amountPaid: '449.00',
    });
    await queue.approve(quote.id, operatorId());

    const list = await invoices.listForTenant(tenantId);
    const invoice = await invoiceRow(list[0]?.id ?? '');
    expect(invoice?.payment_method).toBe('wallet');
    expect(invoice?.payment_reference).toBe(transactionId);
  });
});

describeIfDatabase('AUD-08, ADM-04: a rejected payment in the shop activity log', () => {
  it('records the rejection and its note as Platform support, never the operator id', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');
    const quote = await purchase.quote(tenantId, planId, termId);
    await purchase.submitWalletPayment(quote.id, tenantId, {
      transactionId: `TXN-${randomUUID()}`,
      senderNumber: '01710000000',
      amountPaid: '449.00',
    });

    await queue.reject(quote.id, operatorId(), 'No such transaction in the bKash statement');

    const log = await admin.query<{
      actor_type: string;
      actor_id: string | null;
      summary: { note?: string; amount?: string };
    }>(
      `SELECT actor_type, actor_id, summary FROM tenant.activity_log
       WHERE tenant_id = $1 AND action = 'plan_payment_rejected'`,
      [tenantId],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({
      actor_type: 'platform_support',
      actor_id: null,
      summary: { note: 'No such transaction in the bKash statement', amount: '449.00' },
    });
  });
});

describeIfDatabase('TRM-04: retiring a billing term', () => {
  it('refuses a new purchase or renewal quote against a retired term', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await balance.creditStandalone({ tenantId, amount: '1000.00', type: LedgerEntryType.TopUp });
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');

    await admin.query('UPDATE control.billing_terms SET retired_at = now() WHERE id = $1', [
      termId,
    ]);

    await expect(purchase.quote(tenantId, planId, termId)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('changes nothing for a subscription already on it -- limits, dates and price all survive', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    await balance.creditStandalone({ tenantId, amount: '1000.00', type: LedgerEntryType.TopUp });
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');

    const quote = await purchase.quote(tenantId, planId, termId);
    const result = await purchase.confirmFromBalance(quote.id, tenantId);
    const before = await admin.query<{
      plan_snapshot: unknown;
      period_start: Date;
      period_end: Date;
    }>('SELECT plan_snapshot, period_start, period_end FROM control.tenants WHERE id = $1', [
      tenantId,
    ]);

    await admin.query('UPDATE control.billing_terms SET retired_at = now() WHERE id = $1', [
      termId,
    ]);

    const after = await admin.query<{
      plan_snapshot: unknown;
      period_start: Date;
      period_end: Date;
    }>('SELECT plan_snapshot, period_start, period_end FROM control.tenants WHERE id = $1', [
      tenantId,
    ]);
    expect(after.rows[0]).toEqual(before.rows[0]);

    const invoice = await admin.query<{ amount: string }>(
      'SELECT amount FROM control.invoices WHERE id = $1',
      [result.invoice?.id],
    );
    expect(invoice.rows[0]?.amount).toBe('449.00');
  });
});

describeIfDatabase(
  'plan purchase and renewal by wallet (BIL-02, BIL-06, BIL-07, BIL-10, BIL-11)',
  () => {
    it('BIL-06: an amount mismatch goes to needs_review and never activates the plan', async () => {
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
      const { planId, termId } = await seedPlanAndTerm(1, '449.00');
      const quote = await purchase.quote(tenantId, planId, termId);

      const submitted = await purchase.submitWalletPayment(quote.id, tenantId, {
        transactionId: `TXN-${randomUUID()}`,
        senderNumber: '01710000000',
        amountPaid: '448.00',
      });
      expect(submitted.status).toBe(PlanPaymentStatus.NeedsReview);

      const tenant = await tenantRow(tenantId);
      expect(tenant?.state).toBe('trial');
    });

    it('BIL-05/BIL-07: approving a matching wallet payment activates the plan exactly once', async () => {
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
      const { planId, termId } = await seedPlanAndTerm(1, '449.00');
      const quote = await purchase.quote(tenantId, planId, termId);
      const transactionId = `TXN-${randomUUID()}`;

      await purchase.submitWalletPayment(quote.id, tenantId, {
        transactionId,
        senderNumber: '01710000000',
        amountPaid: '449.00',
      });

      const approved = await queue.approve(quote.id, operatorId());
      expect(approved.status).toBe(PlanPaymentStatus.Verified);

      const tenant = await tenantRow(tenantId);
      expect(tenant?.state).toBe(TenantState.Active);
      expect(tenant?.plan_id).toBe(planId);
    });

    it('BIL-07/BAL-05: the same transaction ID cannot be submitted twice, platform-wide', async () => {
      const tenantA = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
      const tenantB = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
      const { planId, termId } = await seedPlanAndTerm(1, '100.00');
      const transactionId = `TXN-${randomUUID()}`;

      const quoteA = await purchase.quote(tenantA, planId, termId);
      await purchase.submitWalletPayment(quoteA.id, tenantA, {
        transactionId,
        senderNumber: '01710000000',
        amountPaid: '100.00',
      });
      await queue.approve(quoteA.id, operatorId());

      const quoteB = await purchase.quote(tenantB, planId, termId);
      await expect(
        purchase.submitWalletPayment(quoteB.id, tenantB, {
          transactionId,
          senderNumber: '01720000000',
          amountPaid: '100.00',
        }),
      ).rejects.toMatchObject({ code: 'conflict' });
    });

    it('BIL-10: renewing while the period is still running extends from the old end date', async () => {
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');
      const { planId, termId } = await seedPlanAndTerm(1, '100.00');
      const oldPeriodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
      await admin.query('UPDATE control.tenants SET plan_id = $1, period_end = $2 WHERE id = $3', [
        planId,
        oldPeriodEnd,
        tenantId,
      ]);
      await balance.creditStandalone({ tenantId, amount: '1000.00', type: LedgerEntryType.TopUp });

      const quote = await purchase.quote(tenantId, planId, termId);
      await purchase.confirmFromBalance(quote.id, tenantId);

      const tenant = await tenantRow(tenantId);
      const expected = new Date(oldPeriodEnd);
      expected.setUTCMonth(expected.getUTCMonth() + 1);
      expect(new Date(tenant?.period_end ?? 0).getTime()).toBe(expected.getTime());
    });

    it('BIL-11: a purchase after lapse starts a fresh period from confirmation time', async () => {
      const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'grace');
      const { planId, termId } = await seedPlanAndTerm(1, '100.00');
      const pastPeriodEnd = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      await admin.query('UPDATE control.tenants SET plan_id = $1, period_end = $2 WHERE id = $3', [
        planId,
        pastPeriodEnd,
        tenantId,
      ]);
      await balance.creditStandalone({ tenantId, amount: '1000.00', type: LedgerEntryType.TopUp });

      const before = Date.now();
      const quote = await purchase.quote(tenantId, planId, termId);
      await purchase.confirmFromBalance(quote.id, tenantId);

      const tenant = await tenantRow(tenantId);
      expect(tenant?.state).toBe(TenantState.Active);
      const periodEnd = new Date(tenant?.period_end ?? 0);
      expect(periodEnd.getTime()).toBeGreaterThan(before);
    });
  },
);

describeIfDatabase('BIL-15: 24-hour pending-purchase expiry', () => {
  async function paymentRow(id: string) {
    const row = await admin.query<{ status: string; transaction_id: string | null }>(
      'SELECT status, transaction_id FROM control.plan_payments WHERE id = $1',
      [id],
    );
    return row.rows[0];
  }

  async function backdateQuote(id: string, quotedAt: Date): Promise<void> {
    await admin.query('UPDATE control.plan_payments SET quoted_at = $1 WHERE id = $2', [
      quotedAt,
      id,
    ]);
  }

  it('expires an unsubmitted quote past 24h, but leaves a timely submission alone', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');

    const staleQuote = await purchase.quote(tenantId, planId, termId);
    await backdateQuote(staleQuote.id, new Date(Date.now() - 25 * 60 * 60 * 1000));

    // Submitted on time -- the sweep must leave it alone no matter how old the quote itself now is,
    // since the clock is about the tenant's own window to act, not the operator's review speed.
    const submittedQuote = await purchase.quote(tenantId, planId, termId);
    await purchase.submitWalletPayment(submittedQuote.id, tenantId, {
      transactionId: `TXN-${randomUUID()}`,
      senderNumber: '01710000000',
      amountPaid: '449.00',
    });
    await backdateQuote(submittedQuote.id, new Date(Date.now() - 25 * 60 * 60 * 1000));

    const expiredCount = await planPayments.expireStalePending(new Date());
    expect(expiredCount).toBe(1);

    expect((await paymentRow(staleQuote.id))?.status).toBe(PlanPaymentStatus.Expired);
    expect((await paymentRow(submittedQuote.id))?.status).toBe(PlanPaymentStatus.Pending);
  });

  it('a late submission after expiry lands in needs_review regardless of amount match', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');
    const quote = await purchase.quote(tenantId, planId, termId);
    await backdateQuote(quote.id, new Date(Date.now() - 25 * 60 * 60 * 1000));

    await planPayments.expireStalePending(new Date());
    expect((await paymentRow(quote.id))?.status).toBe(PlanPaymentStatus.Expired);

    const submitted = await purchase.submitWalletPayment(quote.id, tenantId, {
      transactionId: `TXN-${randomUUID()}`,
      senderNumber: '01710000000',
      amountPaid: '449.00', // matches exactly -- still needs_review since it arrived after expiry
    });
    expect(submitted.status).toBe(PlanPaymentStatus.NeedsReview);

    const tenant = await tenantRow(tenantId);
    expect(tenant?.state).toBe('trial'); // never activates off a late submission alone
  });

  it('a quote still inside its 24h window is untouched by the sweep', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const { planId, termId } = await seedPlanAndTerm(1, '449.00');
    const quote = await purchase.quote(tenantId, planId, termId);

    const expiredCount = await planPayments.expireStalePending(new Date());
    expect(expiredCount).toBe(0);
    expect((await paymentRow(quote.id))?.status).toBe(PlanPaymentStatus.Pending);
  });
});

describeIfDatabase('balance top-up (BAL-03 to BAL-06)', () => {
  it('BAL-04: rejects an amount outside the platform-wide bounds', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');
    await expect(topUp.quote(tenantId, '50.00')).rejects.toMatchObject({
      code: 'validation_error',
    });
    await expect(topUp.quote(tenantId, '50001.00')).rejects.toMatchObject({
      code: 'validation_error',
    });
  });

  it('BAL-06 (amended): a trial tenant may top up too', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'trial');
    const quote = await topUp.quote(tenantId, '500.00');
    expect(quote.amount).toBe('500.00');
  });

  it('BAL-03/05: a verified top-up credits the balance exactly once', async () => {
    const tenantId = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');
    const before = await balance.current(tenantId);

    const quote = await topUp.quote(tenantId, '500.00');
    const transactionId = `TXN-${randomUUID()}`;
    await topUp.submit(quote.id, tenantId, {
      transactionId,
      senderNumber: '01710000000',
      amountPaid: '500.00',
    });
    const approved = await queue.approve(quote.id, operatorId());
    expect(approved.status).toBe(PlanPaymentStatus.Verified);

    const after = await balance.current(tenantId);
    expect((Number(after.amount) - Number(before.amount)).toFixed(2)).toBe('500.00');
  });
});

describeIfDatabase('tenant isolation (SEC-02)', () => {
  it("another shop's payment id answers not_found on purchase confirm and top-up confirm", async () => {
    const owner = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');
    const intruder = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');
    const { planId, termId } = await seedPlanAndTerm(1, '100.00');

    const purchaseQuote = await purchase.quote(owner, planId, termId);
    await expect(purchase.confirmFromBalance(purchaseQuote.id, intruder)).rejects.toMatchObject({
      code: 'not_found',
    });

    const topUpQuote = await topUp.quote(owner, '500.00');
    await expect(
      topUp.submit(topUpQuote.id, intruder, {
        transactionId: `TXN-${randomUUID()}`,
        senderNumber: '01710000000',
        amountPaid: '500.00',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it("another shop's invoice id answers not_found; a shop's invoice list is its own", async () => {
    const owner = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');
    const intruder = await seedShop(admin, `Shop ${freshSlug()}`, freshSlug(), 'active');
    await balance.creditStandalone({
      tenantId: owner,
      amount: '1000.00',
      type: LedgerEntryType.TopUp,
    });
    const { planId, termId } = await seedPlanAndTerm(1, '100.00');

    const quote = await purchase.quote(owner, planId, termId);
    const { invoice } = await purchase.confirmFromBalance(quote.id, owner);

    const intruderInvoices = await invoices.listForTenant(intruder);
    expect(intruderInvoices.some((inv) => inv.id === invoice?.id)).toBe(false);

    const found = await invoices.findById(invoice?.id ?? '');
    expect(found.tenantId).toBe(owner);
    expect(found.tenantId).not.toBe(intruder);
  });
});

describeIfDatabase('Idempotency-Key (API-11)', () => {
  it('replays the original response for the same key and body, refuses a different one', async () => {
    const key = `idem-${randomUUID()}`;
    const first = await idempotency.begin(key, '/billing/purchase', 'hash-a');
    expect(first.replay).toBe(false);
    await idempotency.complete(key, 201, { ok: true });

    const replay = await idempotency.begin(key, '/billing/purchase', 'hash-a');
    expect(replay).toEqual({ replay: true, status: 201, body: { ok: true } });

    await expect(idempotency.begin(key, '/billing/purchase', 'hash-b')).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });
  });

  it('refuses a concurrent duplicate while the original request is still in flight', async () => {
    const key = `idem-${randomUUID()}`;
    const first = await idempotency.begin(key, '/billing/purchase', 'hash-a');
    expect(first.replay).toBe(false);
    await expect(idempotency.begin(key, '/billing/purchase', 'hash-a')).rejects.toMatchObject({
      code: 'conflict',
    });
  });
});

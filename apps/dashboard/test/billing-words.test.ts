import { describe, expect, it } from 'vitest';
import {
  BillingPaymentState,
  LedgerEntryType,
  PaymentCancelReason,
  PlanPaymentKind,
  PlanPaymentStatus,
} from '@lytronix/validators';
import type { LedgerEntry } from '../src/types/balance';
import type { BillingPayment } from '../src/types/billing';
import {
  forLine,
  invoiceNumber,
  lapsesInHours,
  methodWords,
  paymentName,
  timelineOf,
} from '../src/views/billing/payment-words';
import { entryDetail, entryTitle, STATEMENT_CHIPS } from '../src/views/balance/statement-words';

// The key and its values, so the wording is checked without the dictionary.
const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const NOW = Date.parse('2026-10-26T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function paymentOf(given: Partial<BillingPayment>): BillingPayment {
  return {
    id: 'pay-1',
    tenantId: 't',
    kind: PlanPaymentKind.Renewal,
    planId: 'starter',
    billingTermId: 'month',
    amount: '449.00',
    creditAmount: '0.00',
    quotedAt: new Date(NOW - 3 * HOUR).toISOString(),
    status: PlanPaymentStatus.Pending,
    senderNumber: null,
    transactionId: null,
    verifiedBy: null,
    verifiedAt: null,
    submittedAt: null,
    note: null,
    cancelReason: null,
    createdAt: new Date(NOW - 3 * HOUR).toISOString(),
    state: BillingPaymentState.Awaiting,
    method: null,
    planName: 'Starter',
    billingTerm: { labelEn: '1 month', labelBn: '1 মাস', months: 1 },
    invoice: null,
    addons: [],
    earlierShop: false,
    ...given,
  };
}

describe("Billing's words (TENANT-DASHBOARD-DESIGN §7.13)", () => {
  it('names each kind of payment', () => {
    expect(paymentName(paymentOf({}), t, 'en')).toBe(
      'blRenewal {"plan":"Starter","term":"1 month"}',
    );
    expect(paymentName(paymentOf({ kind: PlanPaymentKind.Purchase }), t, 'bn')).toBe(
      'blFirst {"plan":"Starter","term":"1 মাস"}',
    );
    expect(paymentName(paymentOf({ kind: PlanPaymentKind.TopUp }), t, 'en')).toBe('blTopUp');
    expect(
      paymentName(paymentOf({ kind: PlanPaymentKind.Upgrade, planName: 'Growth' }), t, 'en'),
    ).toBe('upTitle {"plan":"Growth"}');
    const addon = paymentOf({
      kind: PlanPaymentKind.Addon,
      addons: [
        {
          id: 'a',
          key: 'products',
          labelEn: '500 products',
          labelBn: '500টি প্রোডাক্ট',
          quantity: 2,
          price: '149',
          status: 'active',
        },
      ],
    });
    expect(paymentName(addon, t, 'en')).toBe('blAddon {"name":"500 products ×2"}');
  });

  it("says what it was for: a plan's period when the invoice has one, a top-up's amount", () => {
    expect(forLine(paymentOf({}), t, 'en', '10 Oct – 9 Nov 2026')).toBe(
      'blForPlan {"plan":"Starter","term":"1 month","period":"10 Oct – 9 Nov 2026"}',
    );
    expect(forLine(paymentOf({}), t, 'en', null)).toBe(
      'blFirst {"plan":"Starter","term":"1 month"}',
    );
    const topUp = paymentOf({ kind: PlanPaymentKind.TopUp, amount: '500.00' });
    expect(forLine(topUp, t, 'en', null)).toBe('blForTopUp {"amount":"৳500"}');
    expect(forLine({ ...topUp, state: BillingPaymentState.Paid }, t, 'en', null)).toBe(
      'blForTopUpDone {"amount":"৳500"}',
    );
  });

  it('counts the whole hours before a request lapses (BIL-15), and how it went', () => {
    expect(lapsesInHours(paymentOf({}), NOW)).toBe(21);
    expect(
      lapsesInHours(paymentOf({ quotedAt: new Date(NOW - 30 * HOUR).toISOString() }), NOW),
    ).toBe(0);
    expect(methodWords(paymentOf({ method: 'balance' }), t)).toBe('psBalance');
    expect(methodWords(paymentOf({ method: 'wallet', transactionId: '5KD9QW' }), t)).toBe(
      'trx {"trx":"5KD9QW"}',
    );
    expect(methodWords(paymentOf({}), t)).toBe('blNoTrx');
    expect(invoiceNumber(214, t)).toBe('invoiceNo {"number":"000214"}');
  });

  it('tells what happened, newest first, for each state', () => {
    const sent = {
      method: 'wallet' as const,
      transactionId: '8M3PQR',
      submittedAt: new Date(NOW - HOUR).toISOString(),
    };
    const keys = (given: Partial<BillingPayment>): string[] =>
      timelineOf(paymentOf(given), t, null).map((step) => step.key);
    expect(keys({ state: BillingPaymentState.Checking, ...sent })).toEqual([
      'checking',
      'sent',
      'requested',
    ]);
    expect(keys({ state: BillingPaymentState.Rejected, note: 'n', ...sent })).toEqual([
      'rejected',
      'sent',
      'requested',
    ]);
    expect(keys({ state: BillingPaymentState.Expired })).toEqual(['expired', 'requested']);
    expect(keys({ state: BillingPaymentState.Awaiting })).toEqual(['requested']);
    expect(keys({ state: BillingPaymentState.Paid, method: 'balance' })).toEqual([
      'paid',
      'requested',
    ]);
    const replaced = timelineOf(
      paymentOf({
        state: BillingPaymentState.Cancelled,
        cancelReason: PaymentCancelReason.Replaced,
      }),
      t,
      null,
    );
    expect(replaced[0]?.text).toBe('blTlReplaced');
    const rejected = timelineOf(
      paymentOf({ state: BillingPaymentState.Rejected, note: 'Send the full amount', ...sent }),
      t,
      null,
    );
    expect(rejected[0]).toMatchObject({ sub: 'Send the full amount', dot: 'bad' });
  });
});

describe('the statement (TENANT-DASHBOARD-DESIGN §7.11)', () => {
  const entry = (given: Partial<LedgerEntry>): LedgerEntry => ({
    id: 1,
    type: LedgerEntryType.Sms,
    amount: '-1.10',
    units: null,
    rateUsed: null,
    reference: null,
    balanceAfter: '412.50',
    createdAt: new Date(NOW).toISOString(),
    ...given,
  });

  it('reads Fees and Plan as several ledger types at once (Slice 11.5a.3)', () => {
    expect(STATEMENT_CHIPS.map((chip) => chip.key)).toEqual([
      'all',
      'topUps',
      'sms',
      'fees',
      'plan',
    ]);
    expect(STATEMENT_CHIPS.find((chip) => chip.key === 'fees')?.types).toEqual([
      LedgerEntryType.OrderFee,
      LedgerEntryType.ProductFee,
      LedgerEntryType.Extraction,
      LedgerEntryType.FraudCheck,
    ]);
    expect(STATEMENT_CHIPS.find((chip) => chip.key === 'plan')?.types).toEqual([
      LedgerEntryType.PlanPayment,
      LedgerEntryType.Addon,
    ]);
  });

  it('names a row by what it was, with its payment when Billing has it', () => {
    const topUp = entry({ type: LedgerEntryType.TopUp, reference: { planPaymentId: 'pay-1' } });
    const paid = paymentOf({ kind: PlanPaymentKind.TopUp, transactionId: '9F2KQ7' });
    expect(entryTitle(topUp, t, 'en', paid)).toBe('row.top_up · trx {"trx":"9F2KQ7"}');
    expect(entryTitle(topUp, t, 'en', undefined)).toBe('row.top_up');
    expect(entryTitle(entry({ type: LedgerEntryType.PlanPayment }), t, 'bn', paymentOf({}))).toBe(
      'row.plan_payment · Starter · 1 মাস',
    );
    expect(
      entryTitle(
        entry({ type: LedgerEntryType.Adjustment, reference: { reason: 'courier refund' } }),
        t,
        'en',
        undefined,
      ),
    ).toBe('row.adjustment · courier refund');
    expect(entryTitle(entry({ type: LedgerEntryType.CarryOver }), t, 'en', undefined)).toBe(
      'row.carry_over',
    );
  });

  it('writes units at the rate before the time, when there are units', () => {
    expect(entryDetail(entry({ units: '2', rateUsed: '0.5500' }), t, '9:31 am')).toBe(
      'unitsAtRate {"units":"2","rate":"৳0.55"} · 9:31 am',
    );
    expect(entryDetail(entry({}), t, '9:31 am')).toBe('9:31 am');
  });
});

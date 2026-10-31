import { describe, expect, it } from 'vitest';
import {
  BillingPaymentState,
  Permission,
  PlanPaymentKind,
  TenantState,
} from '@lytronix/validators';
import type { Viewer } from '../src/shell/hubs';
import type { HomeView } from '../src/types/home';
import type { MeTenant } from '../src/types/me';
import { jobsOf } from '../src/views/home/jobs';

const NOW = Date.parse('2026-10-23T06:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const OWNER: Viewer = { isOwner: true, permissions: [] };

// The key and its values, so a row's wording is checked without the dictionary.
const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const QUIET: HomeView = {
  products: { total: 12, active: 10 },
  stock: { low: 0, out: 0, expiringBatches: 0 },
  balance: { amount: '480.50', low: false, freeSms: { used: 0, limit: 100 } },
  topUpsBeingChecked: { count: 0, amount: '0' },
  paymentsBeingChecked: { count: 0, amount: '0' },
  paymentNeedingYou: null,
  staffWithoutPassword: 0,
  fastSpendAlertedAt: null,
  checklist: null,
  orders: null,
};

function tenant(state: TenantState, daysLeft: number): MeTenant {
  return {
    id: 't',
    slug: 'shop',
    shopName: 'Shop',
    state,
    suspended: false,
    planName: 'Starter',
    periodEnd: new Date(NOW + daysLeft * DAY).toISOString(),
    autoRenewEnabled: false,
    logo: null,
    brand: null,
    ownDomain: null,
    billingTerm: null,
    lapseStages: null,
    deletesAt: null,
  };
}

const ACTIVE = tenant(TenantState.Active, 30);

// TENANT-DASHBOARD-DESIGN §7.1: the queue's rows, their order, and who sees them.
describe('the jobs on Home', () => {
  it('has no rows when nothing needs the person', () => {
    expect(jobsOf(QUIET, { t, viewer: OWNER, tenant: ACTIVE, now: NOW })).toEqual([]);
  });

  it('heads the queue with a rejected or lapsed payment, which opens it in Billing (BIL-19)', () => {
    for (const [state, key] of [
      [BillingPaymentState.Rejected, 'jobPayRejected'],
      [BillingPaymentState.Expired, 'jobPayExpired'],
    ] as const) {
      const home: HomeView = {
        ...QUIET,
        stock: { low: 2, out: 0, expiringBatches: 0 },
        paymentNeedingYou: { id: 'pay-1', kind: PlanPaymentKind.Renewal, amount: '449.00', state },
      };
      const [first, second] = jobsOf(home, { t, viewer: OWNER, tenant: ACTIVE, now: NOW });
      expect(first).toMatchObject({
        key: 'paymentNeedingYou',
        tone: 'red',
        text: `${key} {"amount":"৳449"}`,
        paymentId: 'pay-1',
      });
      expect(second?.key).toBe('low');
    }
  });

  it('lists every row in the design order, counting things and naming amounts', () => {
    const busy: HomeView = {
      ...QUIET,
      stock: { low: 2, out: 1, expiringBatches: 4 },
      topUpsBeingChecked: { count: 1, amount: '1000' },
      paymentsBeingChecked: { count: 1, amount: '2990' },
      balance: { amount: '12.50', low: true, freeSms: { used: 0, limit: 100 } },
      staffWithoutPassword: 2,
    };
    const jobs = jobsOf(busy, { t, viewer: OWNER, tenant: tenant(TenantState.Trial, 3), now: NOW });
    expect(jobs.map((j) => [j.key, j.count, j.to])).toEqual([
      ['low', 3, '/$shop/stock'],
      ['expiring', 4, '/$shop/stock'],
      ['topup', null, '/$shop/balance'],
      ['payment', null, '/$shop/plan'],
      ['balance', null, '/$shop/balance'],
      ['ending', null, '/$shop/plan'],
      ['staff', 2, '/$shop/team'],
    ]);
    expect(jobs.map((j) => j.text)).toEqual([
      'jobLow {"count":3}',
      'jobExpiring {"count":4}',
      'jobTopup {"amount":"৳1,000"}',
      'jobPlanPay',
      'jobBalance {"amount":"৳12.50"}',
      'jobTrial {"count":3}',
      'jobStaff {"count":2}',
    ]);
  });

  it('shows a plan ending within a week, but not one further off, already over, or on a held shop', () => {
    const ending = (state: TenantState, days: number): string[] =>
      jobsOf(QUIET, { t, viewer: OWNER, tenant: tenant(state, days), now: NOW }).map((j) => j.text);
    expect(ending(TenantState.Active, 7)).toEqual(['jobPlan {"count":7}']);
    expect(ending(TenantState.Active, 8)).toEqual([]);
    expect(ending(TenantState.Active, -1)).toEqual([]);
    expect(ending(TenantState.Grace, 2)).toEqual([]);
  });

  it('keeps the ending row from staff who may not see payments, and the parts the server left out', () => {
    const counter: Viewer = { isOwner: false, permissions: [Permission.InventoryRead] };
    const staffView: HomeView = {
      ...QUIET,
      stock: { low: 1, out: 0, expiringBatches: 0 },
      balance: null,
      topUpsBeingChecked: null,
      paymentsBeingChecked: null,
      staffWithoutPassword: null,
    };
    const jobs = jobsOf(staffView, {
      t,
      viewer: counter,
      tenant: tenant(TenantState.Trial, 2),
      now: NOW,
    });
    expect(jobs.map((j) => j.key)).toEqual(['low']);
    const payer: Viewer = { isOwner: false, permissions: [Permission.PaymentsRead] };
    expect(
      jobsOf(QUIET, { t, viewer: payer, tenant: tenant(TenantState.Trial, 2), now: NOW }).map(
        (j) => j.key,
      ),
    ).toEqual(['ending']);
  });
});

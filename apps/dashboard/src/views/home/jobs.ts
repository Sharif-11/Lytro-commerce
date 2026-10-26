import { BillingPaymentState, Permission, TenantState } from '@lytronix/validators';
import { daysUntil, formatTaka, formatTakaExact } from '@lytronix/ui';
import type { IconName } from '@/components/icon';
import { allows, type Viewer } from '@/shell/hubs';
import type { HomeView } from '@/types/home';
import type { MeTenant } from '@/types/me';

// TRL-08, BIL-14: a trial or a plan ending this soon joins the queue.
const ENDING_SOON_DAYS = 7;

/** A job's tone (the prototype's `.job .ic`), by what it is about: stock and a low balance red, waiting money and an
    ending plan marigold, people teal (decided 2026-10-23 for the rows the sketch does not draw). */
export type JobTone = 'red' | 'marigold' | 'teal';

export type JobPath = '/$shop/stock' | '/$shop/balance' | '/$shop/plan' | '/$shop/team';

export interface Job {
  key: string;
  tone: JobTone;
  icon: IconName;
  text: string;
  /** The rows that count things carry the count; the ones about an amount or a date do not. */
  count: number | null;
  to: JobPath;
  /** A payment's own row opens that payment in Billing instead (BIL-19). */
  paymentId?: string;
}

interface JobContext {
  t: (key: string, options?: Record<string, unknown>) => string;
  viewer: Viewer;
  tenant: MeTenant;
  now?: number;
}

/**
 * TENANT-DASHBOARD-DESIGN §7.1's queue, in its order: a payment to Lytro rejected or lapsed (§7.13), stock low or out, batches expiring, a top-up or a plan payment
 * being checked, a low balance, the trial or the plan ending within a week, staff without a password. Each row shows
 * only when there is something to do and the person may see it (GET /home's parts are null otherwise; STF-11).
 */
export function jobsOf(home: HomeView, { t, viewer, tenant, now }: JobContext): Job[] {
  const jobs: Job[] = [];
  // BIL-19 (the sketch's `home-rejected`): a payment to Lytro that was rejected or lapsed heads the queue.
  const stuck = home.paymentNeedingYou;
  if (stuck) {
    const amount = formatTaka(stuck.amount);
    jobs.push({
      key: 'paymentNeedingYou',
      tone: 'red',
      icon: 'banknote',
      text: t(stuck.state === BillingPaymentState.Rejected ? 'jobPayRejected' : 'jobPayExpired', {
        amount,
      }),
      count: null,
      to: '/$shop/plan',
      paymentId: stuck.id,
    });
  }
  const stock = home.stock;
  if (stock && stock.low + stock.out > 0) {
    const count = stock.low + stock.out;
    jobs.push({
      key: 'low',
      tone: 'red',
      icon: 'box',
      text: t('jobLow', { count }),
      count,
      to: '/$shop/stock',
    });
  }
  if (stock && stock.expiringBatches > 0) {
    const count = stock.expiringBatches;
    jobs.push({
      key: 'expiring',
      tone: 'marigold',
      icon: 'clock',
      text: t('jobExpiring', { count }),
      count,
      to: '/$shop/stock',
    });
  }
  if (home.topUpsBeingChecked && home.topUpsBeingChecked.count > 0) {
    const amount = formatTaka(home.topUpsBeingChecked.amount);
    jobs.push({
      key: 'topup',
      tone: 'marigold',
      icon: 'banknote',
      text: t('jobTopup', { amount }),
      count: null,
      to: '/$shop/balance',
    });
  }
  if (home.paymentsBeingChecked && home.paymentsBeingChecked.count > 0) {
    jobs.push({
      key: 'payment',
      tone: 'marigold',
      icon: 'banknote',
      text: t('jobPlanPay'),
      count: null,
      to: '/$shop/plan',
    });
  }
  if (home.balance?.low) {
    const amount = formatTakaExact(home.balance.amount);
    jobs.push({
      key: 'balance',
      tone: 'red',
      icon: 'banknote',
      text: t('jobBalance', { amount }),
      count: null,
      to: '/$shop/balance',
    });
  }
  const left = daysUntil(tenant.periodEnd, now);
  const running = tenant.state === TenantState.Trial || tenant.state === TenantState.Active;
  if (
    running &&
    allows(viewer, [Permission.PaymentsRead]) &&
    left !== null &&
    left > 0 &&
    left <= ENDING_SOON_DAYS
  ) {
    jobs.push({
      key: 'ending',
      tone: 'marigold',
      icon: 'calendar',
      text: t(tenant.state === TenantState.Trial ? 'jobTrial' : 'jobPlan', { count: left }),
      count: null,
      to: '/$shop/plan',
    });
  }
  if (home.staffWithoutPassword) {
    const count = home.staffWithoutPassword;
    jobs.push({
      key: 'staff',
      tone: 'teal',
      icon: 'users',
      text: t('jobStaff', { count }),
      count,
      to: '/$shop/team',
    });
  }
  return jobs;
}

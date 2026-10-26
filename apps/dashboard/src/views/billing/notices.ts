import { BillingPaymentState, Permission, PlanPaymentKind } from '@lytronix/validators';
import { useBillingPayments } from '@/api/billing';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { BillingPayment } from '@/types/billing';

/** What a banner says about the newest payment of a kind: being checked, or rejected with support's note. */
export type PaymentNotice =
  { state: 'checking'; payment: BillingPayment } | { state: 'rejected'; payment: BillingPayment };

const PLAN_KINDS: readonly PlanPaymentKind[] = [
  PlanPaymentKind.Purchase,
  PlanPaymentKind.Renewal,
  PlanPaymentKind.Upgrade,
  PlanPaymentKind.Addon,
];

function noticeOf(payment: BillingPayment | undefined): PaymentNotice | null {
  if (!payment) return null;
  if (payment.state === BillingPaymentState.Checking) return { state: 'checking', payment };
  if (payment.state === BillingPaymentState.Rejected) return { state: 'rejected', payment };
  return null;
}

/**
 * The being-checked and rejected banners of Plan, Balance and Add-ons (TENANT-DASHBOARD-DESIGN §7.11, §7.12, §7.25),
 * read from the payments list, never the browser's memory, so they hold across a reload and a second phone. Each
 * looks at the newest payment of its own kinds only: a newer one makes an older rejection history.
 */
export function usePaymentNotices(): {
  plan: PaymentNotice | null;
  topUp: PaymentNotice | null;
  addon: PaymentNotice | null;
} {
  const { viewer, tenant } = useShell();
  // A suspended shop's owner may not read the list (LIF-24): no banner then.
  const payments = useBillingPayments(null, {
    enabled: allows(viewer, [Permission.PaymentsRead]) && !tenant.suspended,
  });
  const first = (payments.data?.pages[0]?.payments ?? []).filter((payment) => !payment.earlierShop);
  return {
    plan: noticeOf(first.find((payment) => PLAN_KINDS.includes(payment.kind))),
    topUp: noticeOf(first.find((payment) => payment.kind === PlanPaymentKind.TopUp)),
    addon: noticeOf(first.find((payment) => payment.kind === PlanPaymentKind.Addon)),
  };
}

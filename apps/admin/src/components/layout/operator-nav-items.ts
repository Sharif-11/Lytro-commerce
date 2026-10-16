import { CalendarIcon, GaugeIcon, LockIcon, TagIcon } from '@/components/icons';

export interface OperatorNavItem {
  to: '/operator/plans' | '/operator/billing-terms' | '/operator/rates' | '/operator/tenants';
  labelKey: string;
  icon: typeof TagIcon;
}

/** D2-9's narrow slice-8 scope was plan/billing-term/rate editors only, with suspend/restore (LIF-24) and
    the rest of payment-queue/limit-override/balance-adjust deferred to the unplanned Phase 8 (ADM-*) — but
    suspend/restore came back in scope on its own since its backend (OperatorTenantLifecycleController) was
    already done; the rest of that deferred set still has no entry here. Unlike the tenant-side
    nav-items.ts, there's no permission gating to apply (OperatorSessionGuard alone gates every operator
    route today), so this is just a plain list. */
export const operatorNavItems: OperatorNavItem[] = [
  { to: '/operator/plans', labelKey: 'operator.nav.plans', icon: TagIcon },
  { to: '/operator/billing-terms', labelKey: 'operator.nav.billingTerms', icon: CalendarIcon },
  { to: '/operator/rates', labelKey: 'operator.nav.rates', icon: GaugeIcon },
  { to: '/operator/tenants', labelKey: 'operator.nav.tenants', icon: LockIcon },
];

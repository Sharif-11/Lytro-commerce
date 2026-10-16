import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmPurchaseInput,
  ConfirmUpgradeInput,
  QuotePurchaseInput,
  QuoteUpgradeInput,
  TargetDowngradePlanInput,
} from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import { ME_QUERY_KEY } from '@/api/auth';
import type { Plan, BillingTerm, PlanPrice } from '@/types/billing-admin';
import type { Invoice, OverLimitItem, ScheduledPlanChange } from '@/types/billing';
import type { PlanPayment } from '@/types/plan-payment';

export const PUBLIC_PLANS_QUERY_KEY = ['plans'] as const;
export const PUBLIC_BILLING_TERMS_QUERY_KEY = ['billing-terms'] as const;
export const publicPlanPricesKey = (planId: string) => ['plans', planId, 'prices'] as const;
export const SCHEDULED_DOWNGRADE_QUERY_KEY = ['billing', 'downgrade'] as const;
export const INVOICES_QUERY_KEY = ['billing', 'invoices'] as const;
export const invoiceKey = (id: string) => ['billing', 'invoices', id] as const;

// PLN-10/TRM-02: platform-wide, reachable with no tenant context — same two routes the public marketing
// site and a signed-in tenant both read (PlansController's own note).
export function usePublicPlans() {
  return useQuery({
    queryKey: PUBLIC_PLANS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<Plan[]>('/plans'),
  });
}

export function usePublicBillingTerms() {
  return useQuery({
    queryKey: PUBLIC_BILLING_TERMS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<BillingTerm[]>('/billing-terms'),
  });
}

/** D2-12: the real price for a (for-sale plan, any term) pair -- without this the comparison grid can only
    show limits/features, never a figure, which is the gap D2-12 names explicitly. */
export function usePublicPlanPrices(planId: string | null) {
  return useQuery({
    queryKey: publicPlanPricesKey(planId ?? ''),
    queryFn: () => tenantSession.client.get<PlanPrice[]>(`/plans/${planId ?? ''}/prices`),
    enabled: planId !== null,
  });
}

/** BIL-01: prices a purchase or renewal (PurchaseService.quote picks the kind by whether this is the
    tenant's current plan) — no cache invalidation, the quote is ephemeral until confirmed. */
export function useQuotePurchase() {
  return useMutation({
    mutationFn: (input: QuotePurchaseInput) =>
      tenantSession.client.post<PlanPayment>('/billing/quote', input),
  });
}

/** BIL-02/08/16: confirms a purchase/renewal quote, from balance or by submitting a wallet payment. A
    balance payment activates the plan immediately, so /me's planName/state can change — invalidated either
    way rather than branching on `method`, since a wallet submission invalidating a no-op /me is harmless. */
export function useConfirmPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmPurchaseInput) =>
      tenantSession.client.post<PlanPayment>('/billing/purchase', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

/** UPG-01/02: only valid while `active` with a live period (UpgradeService.quote) — the plan grid only
    offers this action in that state, but the server is the real gate. */
export function useQuoteUpgrade() {
  return useMutation({
    mutationFn: (input: QuoteUpgradeInput) =>
      tenantSession.client.post<PlanPayment>('/billing/upgrade/quote', input),
  });
}

export function useConfirmUpgrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmUpgradeInput) =>
      tenantSession.client.post<PlanPayment>('/billing/upgrade/confirm', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

/** DWN-03: no cache key of its own — the preview is read fresh for whichever plan is currently selected,
    held in the caller's own local state rather than cached by plan id. */
export function useDowngradePreview() {
  return useMutation({
    mutationFn: (input: TargetDowngradePlanInput) =>
      tenantSession.client.post<OverLimitItem[]>('/billing/downgrade/preview', input),
  });
}

export function useScheduledDowngrade() {
  return useQuery({
    queryKey: SCHEDULED_DOWNGRADE_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ScheduledPlanChange | null>('/billing/downgrade'),
  });
}

export function useScheduleDowngrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TargetDowngradePlanInput) =>
      tenantSession.client.post<ScheduledPlanChange>('/billing/downgrade/schedule', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCHEDULED_DOWNGRADE_QUERY_KEY });
    },
  });
}

export function useCancelDowngrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/billing/downgrade/cancel'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCHEDULED_DOWNGRADE_QUERY_KEY });
    },
  });
}

/** LIF-01: there is no read route anywhere for "is a cancellation currently scheduled" (checked every
    billing/tenant controller) — only the write side exists. These two actions are therefore fire-and-forget:
    each shows its own one-line success message (closing the action is the success UI, the same convention
    ErrorBanner's callers already follow) rather than trying to reflect a persisted toggle state this API
    can't currently answer. */
export function useCancelSubscription() {
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/billing/cancel'),
  });
}

export function useUndoCancellation() {
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/billing/cancel/undo'),
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: INVOICES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<Invoice[]>('/billing/invoices'),
  });
}

export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: invoiceKey(id ?? ''),
    queryFn: () => tenantSession.client.get<Invoice>(`/billing/invoices/${id ?? ''}`),
    enabled: id !== null,
  });
}

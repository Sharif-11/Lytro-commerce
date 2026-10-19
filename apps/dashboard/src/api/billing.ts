import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmPurchaseInput,
  ConfirmUpgradeInput,
  QuotePurchaseInput,
  QuoteUpgradeInput,
  SetAutoRenewInput,
  TargetDowngradePlanInput,
} from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import { ME_QUERY_KEY } from '@/api/me';
import { BALANCE_QUERY_KEY, LEDGER_QUERY_KEY } from '@/api/balance';
import type {
  BillingTerm,
  CancellationStatus,
  Invoice,
  OverLimitItem,
  Plan,
  PlanPayment,
  PlanPrice,
  PlatformWallet,
  ScheduledPlanChange,
} from '@/types/billing';

export const PLANS_QUERY_KEY = ['plans'] as const;
export const BILLING_TERMS_QUERY_KEY = ['billing-terms'] as const;
export const SCHEDULED_CHANGE_QUERY_KEY = ['billing', 'downgrade'] as const;
export const CANCELLATION_QUERY_KEY = ['billing', 'cancellation'] as const;
export const INVOICES_QUERY_KEY = ['billing', 'invoices'] as const;
const planPricesKey = (planId: string) => ['plans', planId, 'prices'] as const;

// PLN-10/TRM-02: the same public, keyless catalogue the marketing site reads.
export function usePlans() {
  return useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<Plan[]>('/plans'),
  });
}

export function useBillingTerms() {
  return useQuery({
    queryKey: BILLING_TERMS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<BillingTerm[]>('/billing-terms'),
  });
}

/** Every for-sale plan's prices at once, for the picker's full table (D2-12). */
export function usePlanPrices(planIds: string[]) {
  return useQueries({
    queries: planIds.map((planId) => ({
      queryKey: planPricesKey(planId),
      queryFn: () => tenantSession.client.get<PlanPrice[]>(`/plans/${planId}/prices`),
    })),
    combine: (results) => ({
      prices: results.flatMap((result) => result.data ?? []),
      isLoading: results.some((result) => result.isLoading),
    }),
  });
}

export function usePlatformWallets() {
  return useQuery({
    queryKey: ['platform-wallets'],
    queryFn: () => tenantSession.client.get<PlatformWallet[]>('/platform-wallets'),
  });
}

function useInvalidateBilling() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: SCHEDULED_CHANGE_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: CANCELLATION_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: BALANCE_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
  };
}

// --- Purchase and renewal (BIL-01, BIL-02) ---

/** The quote is ephemeral until confirmed, so nothing is cached. */
export function useQuotePurchase() {
  return useMutation({
    mutationFn: (input: QuotePurchaseInput) =>
      tenantSession.client.post<PlanPayment>('/billing/quote', input),
  });
}

/** A balance payment activates the plan at once; a wallet submission enters the operator's review queue. */
export function useConfirmPurchase() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (input: ConfirmPurchaseInput) =>
      tenantSession.client.post<PlanPayment>('/billing/purchase', input),
    onSuccess: invalidate,
  });
}

// --- Upgrade (UPG-01..13) ---

export function useQuoteUpgrade() {
  return useMutation({
    mutationFn: (input: QuoteUpgradeInput) =>
      tenantSession.client.post<PlanPayment>('/billing/upgrade/quote', input),
  });
}

export function useConfirmUpgrade() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (input: ConfirmUpgradeInput) =>
      tenantSession.client.post<PlanPayment>('/billing/upgrade/confirm', input),
    onSuccess: invalidate,
  });
}

// --- Downgrade (DWN-01..05) and pay-as-you-go (PYG-01, LIF-15) ---

export function useDowngradePreview() {
  return useMutation({
    mutationFn: (input: TargetDowngradePlanInput) =>
      tenantSession.client.post<OverLimitItem[]>('/billing/downgrade/preview', input),
  });
}

export function useScheduledChange() {
  return useQuery({
    queryKey: SCHEDULED_CHANGE_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ScheduledPlanChange | null>('/billing/downgrade'),
  });
}

export function useScheduleDowngrade() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (input: TargetDowngradePlanInput) =>
      tenantSession.client.post<ScheduledPlanChange>('/billing/downgrade/schedule', input),
    onSuccess: invalidate,
  });
}

export function useCancelScheduledChange() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/billing/downgrade/cancel'),
    onSuccess: invalidate,
  });
}

export function useChoosePayAsYouGo() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: () =>
      tenantSession.client.post<{ effective: 'now' | 'period_end'; effectiveAt: string | null }>(
        '/billing/pay-as-you-go',
      ),
    onSuccess: invalidate,
  });
}

// --- Cancellation, closing and auto-renew (LIF-01, PYG-09, BIL-17) ---

export function useCancellation() {
  return useQuery({
    queryKey: CANCELLATION_QUERY_KEY,
    queryFn: () => tenantSession.client.get<CancellationStatus>('/billing/cancellation'),
  });
}

export function useCancelSubscription() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/billing/cancel'),
    onSuccess: invalidate,
  });
}

export function useUndoCancellation() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/billing/cancel/undo'),
    onSuccess: invalidate,
  });
}

/** PYG-09: closes a pay-as-you-go shop now; owner only. */
export function useCloseShop() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/billing/close'),
    onSuccess: invalidate,
  });
}

export function useSetAutoRenew() {
  return useMutation({
    mutationFn: (input: SetAutoRenewInput) =>
      tenantSession.client.post<{ ok: true }>('/billing/auto-renew', input),
  });
}

// --- Invoices (BIL-12, BIL-13) ---

export function useInvoices() {
  return useQuery({
    queryKey: INVOICES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<Invoice[]>('/billing/invoices'),
  });
}

import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type BillingPaymentState,
  type ConfirmPurchaseInput,
  type ConfirmUpgradeInput,
  PlanPaymentKind,
  type QuotePurchaseInput,
  type QuoteUpgradeInput,
  type SetAutoRenewInput,
  type TargetDowngradePlanInput,
} from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import { ME_QUERY_KEY } from '@/api/me';
import { BALANCE_QUERY_KEY, LEDGER_QUERY_KEY } from '@/api/balance';
import { HOME_QUERY_KEY } from '@/api/home';
import { PAYMENTS_QUERY_KEY } from '@/api/payment-keys';
import type {
  BillingPayment,
  BillingPaymentPage,
  BillingTerm,
  CancellationStatus,
  DowngradeChecklist,
  Invoice,
  OverLimitItem,
  Plan,
  PlanPayment,
  PlanPrice,
  PlanPriceOption,
  PlatformWallet,
  ScheduledPlanChange,
  UpgradeQuote,
} from '@/types/billing';

export const PLANS_QUERY_KEY = ['plans'] as const;
export const BILLING_TERMS_QUERY_KEY = ['billing-terms'] as const;
export const SCHEDULED_CHANGE_QUERY_KEY = ['billing', 'downgrade'] as const;
export const CANCELLATION_QUERY_KEY = ['billing', 'cancellation'] as const;
export const INVOICES_QUERY_KEY = ['billing', 'invoices'] as const;
export const BILLING_PRICES_QUERY_KEY = ['billing', 'prices'] as const;
export const DOWNGRADE_CHECKLIST_QUERY_KEY = ['billing', 'downgrade', 'checklist'] as const;
// Billing opened cold on one payment looks this far back for it (decided for Slice 11.5b).
const COLD_OPEN_PAGES = 5;
const planPricesKey = (planId: string) => ['plans', planId, 'prices'] as const;

// PLN-10/TRM-02: the same public, keyless catalogue the marketing site reads.
export function usePlans() {
  return useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<Plan[]>('/plans'),
  });
}

/** PYG-01: the plan a pay-as-you-go shop is on, never for sale, for its card's and switch sheet's limits. */
export function usePayAsYouGoPlan() {
  return useQuery({
    queryKey: [...PLANS_QUERY_KEY, 'pay-as-you-go'],
    queryFn: () => tenantSession.client.get<Plan>('/plans/pay-as-you-go'),
  });
}

/**
 * BIL-09 (decided 2026-10-23): what each plan would cost the shop now on a term, read without making a payment. Every
 * price the plan screens show comes from here; the request is made only when the seller commits.
 */
export function useBillingPrices(billingTermId: string | null) {
  return useQuery({
    queryKey: [...BILLING_PRICES_QUERY_KEY, billingTermId],
    queryFn: () =>
      tenantSession.client.get<PlanPriceOption[]>(
        `/billing/prices?billingTermId=${encodeURIComponent(billingTermId ?? '')}`,
      ),
    enabled: billingTermId !== null,
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
    void queryClient.invalidateQueries({ queryKey: BILLING_PRICES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: DOWNGRADE_CHECKLIST_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
  };
}

/** The figures changed under the seller (AmountChanged): read them again. */
export function useRefreshPrices() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: BILLING_PRICES_QUERY_KEY });
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
      tenantSession.client.post<UpgradeQuote>('/billing/upgrade/quote', input),
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

/** DWN-03: what a move down to this plan would leave the shop over; a read, though the route is a POST. */
export function useDowngradePreview(planId: string | null) {
  return useQuery({
    queryKey: ['billing', 'downgrade', 'preview', planId],
    queryFn: () =>
      tenantSession.client.post<OverLimitItem[]>('/billing/downgrade/preview', {
        planId: planId ?? '',
      } satisfies TargetDowngradePlanInput),
    enabled: planId !== null,
  });
}

/** DWN-12, DWN-14: the last downgrade's checklist, for 30 days; null when there is none. */
export function useDowngradeChecklist(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: DOWNGRADE_CHECKLIST_QUERY_KEY,
    queryFn: async () =>
      (
        await tenantSession.client.get<{ checklist: DowngradeChecklist | null }>(
          '/billing/downgrade/checklist',
        )
      ).checklist,
    enabled: options.enabled ?? true,
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

// --- Billing: the shop's payments to Lytro and their invoices (BIL-12, BIL-13, BIL-19) ---

function paymentsPage(
  page: number,
  state: BillingPaymentState | null,
): Promise<BillingPaymentPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (state) params.set('state', state);
  return tenantSession.client.get<BillingPaymentPage>(`/billing/payments?${params.toString()}`);
}

/** BIL-19: the shop's payments to Lytro, newest first, a page at a time; only one state when a chip picks it. */
export function useBillingPayments(
  state: BillingPaymentState | null,
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: [...PAYMENTS_QUERY_KEY, state],
    queryFn: ({ pageParam }) => paymentsPage(pageParam, state),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: options.enabled ?? true,
  });
}

/**
 * One payment, for Billing opened cold on it (`/billing/:id`, no detail route on the server): its list read a page at a
 * time, up to five, until it is found; null when it is not among them.
 */
export function useBillingPaymentById(id: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...PAYMENTS_QUERY_KEY, 'find', id],
    queryFn: async () => {
      for (let page = 1; page <= COLD_OPEN_PAGES; page += 1) {
        const result = await paymentsPage(page, null);
        const found = result.payments.find((payment) => payment.id === id);
        if (found) return found;
        if (page >= result.pages) break;
      }
      return null;
    },
    enabled: id !== null && (options.enabled ?? true),
  });
}

/**
 * BIL-19 (decided 2026-10-23): closes a request nothing was sent for -- a top-up under the balance's own route, any other
 * under Billing's. Nothing is charged.
 */
export function useCancelPayment() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (payment: Pick<BillingPayment, 'id' | 'kind'>) =>
      tenantSession.client.post<PlanPayment>(
        payment.kind === PlanPaymentKind.TopUp
          ? `/balance/top-up/${encodeURIComponent(payment.id)}/cancel`
          : `/billing/payments/${encodeURIComponent(payment.id)}/cancel`,
      ),
    onSuccess: invalidate,
  });
}

/** BIL-12, BIL-13: every invoice, for the first build's Menu until Slice 11.6 rebuilds it. */
export function useInvoices(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: INVOICES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<Invoice[]>('/billing/invoices'),
    enabled: options.enabled ?? true,
  });
}

/** BIL-12: a paid payment's invoice, its receipt. */
export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, id],
    queryFn: () =>
      tenantSession.client.get<Invoice>(`/billing/invoices/${encodeURIComponent(id ?? '')}`),
    enabled: id !== null,
  });
}

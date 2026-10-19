import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfirmPurchaseInput, QuotePurchaseInput } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import { ME_QUERY_KEY } from '@/api/me';
import type { BillingTerm, Plan, PlanPayment, PlanPrice, PlatformWallet } from '@/types/billing';

export const PLANS_QUERY_KEY = ['plans'] as const;
export const BILLING_TERMS_QUERY_KEY = ['billing-terms'] as const;
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

/** BIL-01: prices a purchase; the quote is ephemeral until confirmed, so nothing is cached. */
export function useQuotePurchase() {
  return useMutation({
    mutationFn: (input: QuotePurchaseInput) =>
      tenantSession.client.post<PlanPayment>('/billing/quote', input),
  });
}

/** BIL-02: a wallet submission enters the operator's review queue; /me is refreshed either way since a
    verified payment changes the plan shown on the home screen. */
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

/** PYG-01/LIF-15: choose pay-as-you-go, now or at period end. */
export function useChoosePayAsYouGo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      tenantSession.client.post<{ effective: 'now' | 'period_end'; effectiveAt: string | null }>(
        '/billing/pay-as-you-go',
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

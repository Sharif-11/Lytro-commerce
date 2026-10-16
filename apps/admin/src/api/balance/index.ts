import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfirmTopUpInput, QuoteTopUpInput } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { BalanceSnapshot, LedgerPage, RateValue } from '@/types/balance';
import type { PlanPayment } from '@/types/plan-payment';

export const BALANCE_QUERY_KEY = ['balance'] as const;
export const LEDGER_QUERY_KEY = ['balance', 'ledger'] as const;
export const RATES_QUERY_KEY = ['balance', 'current-rates'] as const;
const PAGE_SIZE = 50;

export function useBalance() {
  return useQuery({
    queryKey: BALANCE_QUERY_KEY,
    queryFn: () => tenantSession.client.get<BalanceSnapshot>('/balance'),
  });
}

export interface LedgerFilters {
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** GET /balance/ledger is cursor-paginated (BAL-14), the cursor is the last row's numeric id -- same shape
    as activity's string cursor, just a different primitive, so useInfiniteQuery maps onto it the same way. */
export function useLedger(filters: LedgerFilters) {
  return useInfiniteQuery({
    queryKey: [...LEDGER_QUERY_KEY, filters],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.type) params.set('type', filters.type);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      params.set('limit', String(PAGE_SIZE));
      if (pageParam !== undefined) params.set('cursor', String(pageParam));
      return tenantSession.client.get<LedgerPage>(`/balance/ledger?${params.toString()}`);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useCurrentRates() {
  return useQuery({
    queryKey: RATES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<RateValue[]>('/balance/current-rates'),
  });
}

/** POST /balance/top-up/quote -- the quote is held in local component state until confirmed (BIL-09's
    quote-then-pay shape), so there's nothing to invalidate here; confirming is what changes the balance. */
export function useQuoteTopUp() {
  return useMutation({
    mutationFn: (input: QuoteTopUpInput) =>
      tenantSession.client.post<PlanPayment>('/balance/top-up/quote', input),
  });
}

/** POST /balance/top-up/confirm is the tenant's wallet-payment submission (BAL-03) -- it enters the
    operator's review queue, nothing is credited yet, but the submission itself is worth refetching for
    (status moves pending -> the row now exists in the statement once an operator approves it later). */
export function useConfirmTopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmTopUpInput) =>
      tenantSession.client.post<PlanPayment>('/balance/top-up/confirm', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BALANCE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY });
    },
  });
}

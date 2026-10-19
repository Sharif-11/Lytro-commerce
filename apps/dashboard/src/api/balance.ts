import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfirmTopUpInput, QuoteTopUpInput } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { BalanceSnapshot, EssentialSmsUsage, LedgerPage, RateValue } from '@/types/balance';
import type { PlanPayment } from '@/types/billing';

export const BALANCE_QUERY_KEY = ['balance'] as const;
export const LEDGER_QUERY_KEY = ['balance', 'ledger'] as const;
const PAGE_SIZE = 50;

export function useBalance(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: BALANCE_QUERY_KEY,
    queryFn: () => tenantSession.client.get<BalanceSnapshot>('/balance'),
    enabled: options.enabled ?? true,
  });
}

export interface LedgerFilters {
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** GET /balance/ledger is cursor-paginated on the last row's numeric id (BAL-14). */
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

/** GET /balance/ledger/export: a CSV download, opened by the browser directly with the session cookie. */
export function ledgerExportUrl(filters: LedgerFilters): string {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  const query = params.toString();
  return `/api/v1/balance/ledger/export${query ? `?${query}` : ''}`;
}

export function useCurrentRates() {
  return useQuery({
    queryKey: ['balance', 'current-rates'],
    queryFn: () => tenantSession.client.get<RateValue[]>('/balance/current-rates'),
  });
}

export function useEssentialSms() {
  return useQuery({
    queryKey: ['balance', 'essential-sms'],
    queryFn: () => tenantSession.client.get<EssentialSmsUsage>('/balance/essential-sms'),
  });
}

/** BAL-03: the quote is held in local state until confirmed; confirming is what changes the balance. */
export function useQuoteTopUp() {
  return useMutation({
    mutationFn: (input: QuoteTopUpInput) =>
      tenantSession.client.post<PlanPayment>('/balance/top-up/quote', input),
  });
}

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

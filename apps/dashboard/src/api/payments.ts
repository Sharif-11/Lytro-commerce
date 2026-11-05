import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentListStatus, PaymentMethod, PaymentRejectReason } from '@lytronix/validators';
import { PaymentListStatus as Status } from '@lytronix/validators';
import { useOrderChanged } from '@/api/orders';
import { tenantSession } from '@/session/tenant-session';
import type { Order } from '@/types/orders';
import type { ShopPaymentsPage } from '@/types/payments';

// Payments (TENANT-DASHBOARD-DESIGN §7.36, Slice 5.8's part 3): the shop's incoming money, one list (PAY-19) with what waits to
// be verified as one of its statuses. Reading is payments:read, deciding payments:verify.

export const PAYMENTS_QUERY_KEY = ['payments'] as const;
const PAGE_SIZE = 25;
// A phone may verify a payment while staff are looking at the list, so what waits is read again this often.
const WAITING_POLL_MS = 30_000;

export interface PaymentFilters {
  status?: PaymentListStatus;
  method?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}

function paymentParams(filters: PaymentFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.method) params.set('method', filters.method);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.q) params.set('q', filters.q);
  return params;
}

/** GET /payments, a page at a time, newest first. */
export function usePayments(filters: PaymentFilters) {
  return useInfiniteQuery({
    queryKey: [...PAYMENTS_QUERY_KEY, 'list', filters],
    queryFn: ({ pageParam }) => {
      const params = paymentParams(filters);
      params.set('page', String(pageParam));
      params.set('limit', String(PAGE_SIZE));
      return tenantSession.client.get<ShopPaymentsPage>(`/payments?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    refetchInterval: filters.status === Status.ToVerify ? WAITING_POLL_MS : false,
  });
}

/** The To verify tab's count, whichever tab is open. */
export function useToVerifyCount() {
  return useQuery({
    queryKey: [...PAYMENTS_QUERY_KEY, 'to-verify'],
    queryFn: () =>
      tenantSession.client.get<ShopPaymentsPage>(`/payments?status=${Status.ToVerify}&limit=1`),
    select: (page) => page.total,
    refetchInterval: WAITING_POLL_MS,
  });
}

/** GET /payments/export: the same filters as a file, fetched so that it names this shop, then saved. */
export async function downloadPayments(filters: PaymentFilters): Promise<void> {
  const query = paymentParams(filters).toString();
  const file = await tenantSession.client.file(`/payments/export${query ? `?${query}` : ''}`);
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'payments.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/** After a decision: the order as it now is, every list of payments, and Home. The list is read again after a refusal too. */
function useDecided() {
  const queryClient = useQueryClient();
  const changed = useOrderChanged(true);
  return {
    onSuccess: changed,
    onSettled: () => queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY }),
  };
}

/** POST /payments/:id/verify (VER-01, PAY-15): the amount that arrived, never more than is due. */
export function useVerifyPayment() {
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) =>
      tenantSession.client.post<Order>(`/payments/${id}/verify`, { amount }),
    ...useDecided(),
  });
}

/** POST /payments/:id/reject (PAY-14): the shopper sees the reason, and a checkout's order is cancelled. */
export function useRejectPayment() {
  return useMutation({
    mutationFn: ({
      id,
      reason,
      note,
    }: {
      id: string;
      reason: PaymentRejectReason;
      note?: string;
    }) => tenantSession.client.post<Order>(`/payments/${id}/reject`, { reason, note }),
    ...useDecided(),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BlockInstallationInput, ListenerMessageStatus } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type {
  ListenerCode,
  ListenerDeviceList,
  LytroReceiptPage,
  UnreadShape,
} from '@/types/operator';

const PHONES_QUERY_KEY = ['operator', 'phones'] as const;
const RECEIPTS_QUERY_KEY = ['operator', 'lytro-receipts'] as const;
export const RECEIPTS_PER_PAGE = 20;

/** PAY-21: the phones that read Lytro's own wallets. */
export function useLytroPhones() {
  return useQuery({
    queryKey: [...PHONES_QUERY_KEY, 'lytro'],
    queryFn: () =>
      operatorSession.client.get<ListenerDeviceList>('/operator/lytro-listener/devices'),
  });
}

/** LSN-20: one shop's phones, against its plan's limit. */
export function useShopPhones(shopId: string) {
  return useQuery({
    queryKey: [...PHONES_QUERY_KEY, shopId],
    queryFn: () =>
      operatorSession.client.get<ListenerDeviceList>(
        `/operator/tenants/${shopId}/listener-devices`,
      ),
  });
}

/** A code that pairs one more of Lytro's phones. A new one is asked for each time the panel opens. */
export function usePairingCode() {
  return useMutation({
    mutationFn: () =>
      operatorSession.client.post<ListenerCode>('/operator/lytro-listener/pairing-codes'),
  });
}

export function useRevokePhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.post<{ ok: true }>(`/operator/listener-devices/${id}/revoke`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PHONES_QUERY_KEY });
    },
  });
}

export function useBlockInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BlockInstallationInput) =>
      operatorSession.client.post<{ revoked: number }>(
        '/operator/listener-installations/block',
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PHONES_QUERY_KEY });
    },
  });
}

function receiptsPath(
  status: ListenerMessageStatus | null,
  q: string,
  page: number,
  limit: number,
) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  return `/operator/lytro-listener/receipts?${params.toString()}`;
}

/** What Lytro's phones forwarded, newest first. */
export function useLytroReceipts(status: ListenerMessageStatus | null, q: string, page: number) {
  return useQuery({
    queryKey: [...RECEIPTS_QUERY_KEY, status ?? 'all', q, page],
    queryFn: () =>
      operatorSession.client.get<LytroReceiptPage>(
        receiptsPath(status, q, page, RECEIPTS_PER_PAGE),
      ),
  });
}

/** How many receipts have a status, for a chip's count or a figure on Today. */
export function useReceiptCount(status: ListenerMessageStatus | null, q = '') {
  return useQuery({
    queryKey: [...RECEIPTS_QUERY_KEY, 'count', status ?? 'all', q],
    queryFn: () => operatorSession.client.get<LytroReceiptPage>(receiptsPath(status, q, 1, 1)),
    select: (page) => page.total,
  });
}

/** VER-06: the wording of what the reader couldn't read, by day. */
export function useUnreadShapes(days: number) {
  return useQuery({
    queryKey: ['operator', 'listener-unread', days],
    queryFn: () =>
      operatorSession.client.get<{ shapes: UnreadShape[] }>(
        `/operator/listener-unread?days=${String(days)}`,
      ),
    select: (answer) => answer.shapes,
  });
}

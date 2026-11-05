import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HOME_QUERY_KEY } from '@/api/home';
import { tenantSession } from '@/session/tenant-session';
import type {
  ListenerPhone,
  ListenerPhones,
  PairingCode,
  PhoneReceiptsPage,
} from '@/types/payments';

// Listener phones (TENANT-DASHBOARD-DESIGN §7.37, Slice 5.8's part 4; LSN-01, LSN-02, LSN-20), and what they read.

const PHONES_QUERY_KEY = ['listener', 'devices'] as const;
const RECEIPTS_PAGE_SIZE = 25;

/** GET /listener/devices. `poll`: read it again this often, while waiting for a phone to pair. */
export function useListenerPhones(options: { enabled?: boolean; pollMs?: number } = {}) {
  return useQuery({
    queryKey: PHONES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ListenerPhones>('/listener/devices'),
    enabled: options.enabled ?? true,
    refetchInterval: options.pollMs ?? false,
  });
}

/** After a change: the page, and Home's checklist. */
function usePhonesChanged(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: PHONES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
  };
}

/** POST /listener/pairing-codes (LSN-01, LSN-09): a single-use code, shown once. */
export function useMakePairingCode() {
  return useMutation({
    mutationFn: () => tenantSession.client.post<PairingCode>('/listener/pairing-codes'),
  });
}

/** Called when the page sees a new phone arrive, so Home's checklist hears of it. */
export function usePhonePaired(): () => void {
  return usePhonesChanged();
}

/** PATCH /listener/devices/:id (LSN-20). */
export function useRenamePhone() {
  const changed = usePhonesChanged();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      tenantSession.client.patch<ListenerPhone>(`/listener/devices/${id}`, { name }),
    onSuccess: changed,
  });
}

/** POST /listener/devices/:id/revoke (LSN-02, LSN-19): the phone's next call is refused. */
export function useCancelPhone() {
  const changed = usePhonesChanged();
  return useMutation({
    mutationFn: (id: string) =>
      tenantSession.client.post<ListenerPhone>(`/listener/devices/${id}/revoke`),
    onSuccess: changed,
  });
}

/** GET /listener/receipts (agreed 2026-11-05: a tab on Payments): what the phones read, money with no order included. */
export function usePhoneReceipts(search: string, options: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: ['listener', 'receipts', search],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: String(RECEIPTS_PAGE_SIZE),
      });
      if (search) params.set('q', search);
      return tenantSession.client.get<PhoneReceiptsPage>(`/listener/receipts?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: options.enabled ?? true,
  });
}

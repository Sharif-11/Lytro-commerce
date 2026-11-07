import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CourierKey, type CourierAreaState } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type {
  CourierArea,
  CourierAreaPage,
  CourierAreaRefresh,
  CourierBlocking,
  CourierKeyUsePage,
  CourierRemoved,
  CourierRetired,
  CourierRetireUndone,
  LocationZilla,
  OperatorCourier,
} from '@/types/couriers';

// OPERATOR-CONSOLE-DESIGN §10b: the couriers shops can connect (CRR-23 to CRR-25), RedX's areas placed in thanas (CUS-10), and a
// shop's courier key log (SEC-11, §5). A change reads the couriers again; an area's reads the area list again.

const COURIERS_QUERY_KEY = ['operator', 'couriers'] as const;
const AREAS_QUERY_KEY = ['operator', 'courier-areas'] as const;

/** RedX is the one courier that needs its own areas on every booking (D6-5). */
export const AREAS_COURIER = CourierKey.RedX;
/** The page size §10b draws. */
export const AREAS_PER_PAGE = 50;

/** CRR-23: each courier's state, and how many shops lean on it. */
export function useOperatorCouriers() {
  return useQuery({
    queryKey: COURIERS_QUERY_KEY,
    queryFn: () =>
      operatorSession.client.get<{ couriers: OperatorCourier[] }>('/operator/couriers'),
    select: (answer) => answer.couriers,
  });
}

function useCouriersChanged(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: COURIERS_QUERY_KEY });
  };
}

/** CRR-23, CRR-25: retire a courier, suggesting another; every connected shop is told. */
export function useRetireCourier(key: CourierKey) {
  const changed = useCouriersChanged();
  return useMutation({
    mutationFn: (input: { suggestedKey: CourierKey; reason: string }) =>
      operatorSession.client.post<CourierRetired>(`/operator/couriers/${key}/retire`, input),
    onSuccess: changed,
  });
}

/** Read 6: it can be connected again; the shops told hear it's back. */
export function useUndoRetire(key: CourierKey) {
  const changed = useCouriersChanged();
  return useMutation({
    mutationFn: (reason: string) =>
      operatorSession.client.post<CourierRetireUndone>(`/operator/couriers/${key}/undo-retire`, {
        reason,
      }),
    onSuccess: changed,
  });
}

/** CRR-24: what still waits on a courier, read as Remove opens. */
export function useCourierBlocking(key: CourierKey) {
  return useQuery({
    queryKey: [...COURIERS_QUERY_KEY, key, 'blocking'],
    queryFn: () =>
      operatorSession.client.get<CourierBlocking>(`/operator/couriers/${key}/blocking`),
    // Always as it stands now: a parcel may have moved since the panel last opened.
    staleTime: 0,
    gcTime: 0,
  });
}

/** CRR-24: removed for good once nothing waits on it; refused with the same list while anything does. */
export function useRemoveCourier(key: CourierKey) {
  const changed = useCouriersChanged();
  return useMutation({
    mutationFn: (reason: string) =>
      operatorSession.client.post<CourierRemoved>(`/operator/couriers/${key}/remove`, { reason }),
    onSuccess: changed,
  });
}

export interface AreaFilter {
  state: CourierAreaState | null;
  zillaId: number | null;
  q: string;
  page: number;
}

/** CUS-10: a page of RedX's areas by how they stand, a district or a name, with the chips' counts. */
export function useCourierAreas(filter: AreaFilter) {
  const params = new URLSearchParams({
    courierKey: AREAS_COURIER,
    page: String(filter.page),
    limit: String(AREAS_PER_PAGE),
  });
  if (filter.state) params.set('state', filter.state);
  if (filter.zillaId !== null) params.set('zillaId', String(filter.zillaId));
  if (filter.q) params.set('q', filter.q);
  return useQuery({
    queryKey: [...AREAS_QUERY_KEY, filter],
    queryFn: () =>
      operatorSession.client.get<CourierAreaPage>(`/operator/courier-areas?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

function useAreasChanged(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: AREAS_QUERY_KEY });
  };
}

/** CUS-10: an area placed in a thana, where it then counts, or taken off one with null. */
export function useAssignArea() {
  const changed = useAreasChanged();
  return useMutation({
    mutationFn: ({ id, thanaId }: { id: string; thanaId: number | null }) =>
      operatorSession.client.put<CourierArea>(`/operator/courier-areas/${id}`, { thanaId }),
    onSuccess: changed,
  });
}

/** Suggested areas confirmed in the thanas suggested for them, many at a time. */
export function useConfirmAreas() {
  const changed = useAreasChanged();
  return useMutation({
    mutationFn: (ids: string[]) =>
      operatorSession.client.post<{ confirmed: number }>('/operator/courier-areas/confirm', {
        ids,
      }),
    onSuccess: changed,
  });
}

/** RedX's list read again now, with Lytro's own token; it also runs every Sunday at 03:00. */
export function useRefreshAreas() {
  const changed = useAreasChanged();
  return useMutation({
    mutationFn: () =>
      operatorSession.client.post<CourierAreaRefresh>('/operator/courier-areas/refresh', {
        courierKey: AREAS_COURIER,
      }),
    onSuccess: changed,
  });
}

/** CUS-08: the zillas with their thanas, as the shops' address forms read them; they change only with a migration. */
export function useLocations() {
  return useQuery({
    queryKey: ['operator', 'locations'],
    queryFn: () => operatorSession.client.get<{ zillas: LocationZilla[] }>('/operator/locations'),
    select: (answer) => answer.zillas,
    staleTime: Infinity,
  });
}

/** SEC-11: a shop's courier key log, newest first. */
export function useCourierKeyUses(shopId: string, page: number, limit: number) {
  return useQuery({
    queryKey: ['operator', 'courier-key-uses', shopId, page, limit],
    queryFn: () =>
      operatorSession.client.get<CourierKeyUsePage>(
        `/operator/tenants/${shopId}/courier-credential-uses?page=${String(page)}&limit=${String(limit)}`,
      ),
  });
}

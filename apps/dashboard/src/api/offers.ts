import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { OFFER_PICKABLE_PAGE_SIZE, type OfferCut } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { Offer, OfferItem, OfferPick, OfferPickPage, OfferSummary } from '@/types/offers';
import { PRODUCTS_QUERY_KEY } from './catalogue';

// OFFERS-PLAN: the shop's offers. Reading needs products:read, changing products:manage. A change to an offer's prices
// changes its products too, so every write also refreshes the products the screens show.

const OFFERS_QUERY_KEY = ['offers'] as const;
const offerKey = (id: string) => [...OFFERS_QUERY_KEY, 'detail', id] as const;

/** GET /offers: running, not started and ended. */
export function useOffers() {
  return useQuery({
    queryKey: [...OFFERS_QUERY_KEY, 'list'],
    queryFn: () => tenantSession.client.get<{ offers: OfferSummary[] }>('/offers'),
  });
}

/** GET /offers/:id: an offer and its products, with their prices. */
export function useOffer(id: string) {
  return useQuery({
    queryKey: offerKey(id),
    queryFn: () => tenantSession.client.get<Offer>(`/offers/${id}`),
  });
}

/** GET /offers/pickable: the picker's products, a page at a time (OF-25). */
export function usePickableProducts(query: {
  search: string;
  categoryId: string | null;
  offerId: string | null;
  enabled: boolean;
}) {
  return useInfiniteQuery({
    queryKey: [...OFFERS_QUERY_KEY, 'pickable', query.search, query.categoryId, query.offerId],
    queryFn: ({ pageParam }) =>
      tenantSession.client.get<OfferPickPage>(
        `/offers/pickable?${new URLSearchParams({
          ...(query.search.trim() === '' ? {} : { search: query.search.trim() }),
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.offerId ? { offerId: query.offerId } : {}),
          offset: String(pageParam),
        }).toString()}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.more ? pages.length * OFFER_PICKABLE_PAGE_SIZE : undefined,
    placeholderData: keepPreviousData,
    enabled: query.enabled,
  });
}

/** POST /offers/preview: each product's prices before and in the offer, nothing saved (OF-2). */
export function useOfferPreview(body: {
  cut: OfferCut;
  items: OfferPick[];
  offerId: string | null;
}) {
  return useQuery({
    queryKey: [...OFFERS_QUERY_KEY, 'preview', body],
    queryFn: () =>
      tenantSession.client.post<{ items: OfferItem[] }>('/offers/preview', {
        cut: body.cut,
        items: body.items,
        ...(body.offerId ? { offerId: body.offerId } : {}),
      }),
    enabled: body.items.length > 0 && body.cut.amount > 0,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** After any write: the offers, the one written, and the products whose prices it moved. */
function useWritten(): (offer?: Offer) => void {
  const queryClient = useQueryClient();
  return (offer) => {
    if (offer) queryClient.setQueryData(offerKey(offer.id), offer);
    void queryClient.invalidateQueries({ queryKey: OFFERS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
  };
}

/** POST /offers: a new offer, started now or kept for later (OF-14). */
export function useCreateOffer() {
  const written = useWritten();
  return useMutation({
    mutationFn: (body: { name: string; cut: OfferCut; items: OfferPick[]; start: boolean }) =>
      tenantSession.client.post<Offer>('/offers', body),
    onSuccess: written,
  });
}

/** PATCH /offers/:id: its name, cut or products; live at once while it runs (OF-15). */
export function useUpdateOffer(id: string) {
  const written = useWritten();
  return useMutation({
    mutationFn: (body: { name?: string; cut?: OfferCut; items?: OfferPick[] }) =>
      tenantSession.client.patch<Offer>(`/offers/${id}`, body),
    onSuccess: written,
  });
}

/** POST /offers/:id/start, /end and /copy: start one made ready, end one running, run one again. */
export function useOfferStep(id: string, step: 'start' | 'end' | 'copy') {
  const written = useWritten();
  return useMutation({
    mutationFn: () => tenantSession.client.post<Offer>(`/offers/${id}/${step}`, {}),
    onSuccess: written,
  });
}

/** DELETE /offers/:id: one not running. */
export function useDeleteOffer(id: string) {
  const written = useWritten();
  return useMutation({
    mutationFn: () => tenantSession.client.delete<{ offers: OfferSummary[] }>(`/offers/${id}`),
    onSuccess: () => {
      written();
    },
  });
}

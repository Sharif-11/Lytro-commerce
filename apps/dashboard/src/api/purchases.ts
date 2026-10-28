import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { PurchaseStatus } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type {
  Purchase,
  PurchaseHistoryPage,
  PurchasePage,
  Supplier,
  SupplierPage,
} from '@/types/purchasing';
import { PRODUCTS_QUERY_KEY } from './catalogue';

// Purchases and suppliers (TENANT-DASHBOARD-DESIGN §7.21, Slice 11.10; PUR-01 to PUR-10). Reading needs inventory:read,
// changing inventory:manage. Kept under the products' key: a purchase placed, received or closed changes the stock's
// Coming and On hand, so a change reads both again.

const purchasesKey = [...PRODUCTS_QUERY_KEY, 'purchases'] as const;
const suppliersKey = [...PRODUCTS_QUERY_KEY, 'suppliers'] as const;

/** The Purchases page's segments: what is on order, the drafts, and every purchase. */
export const PURCHASE_SEGMENTS = ['open', 'drafts', 'all'] as const;
export type PurchaseSegment = (typeof PURCHASE_SEGMENTS)[number];

/** What each segment asks GET /purchase-orders for: Open is ordered and partly received (agreed in the 11.10 read). */
const STATUSES: Record<PurchaseSegment, string | null> = {
  open: `${PurchaseStatus.Ordered},${PurchaseStatus.PartiallyReceived}`,
  drafts: PurchaseStatus.Draft,
  all: null,
};

/** GET /purchase-orders (PUR-02): one segment, newest first, a page at a time ("Show more"). */
export function usePurchases(segment: PurchaseSegment) {
  return useInfiniteQuery({
    queryKey: [...purchasesKey, 'list', segment],
    queryFn: ({ pageParam }) => {
      const status = STATUSES[segment];
      return tenantSession.client.get<PurchasePage>(
        `/purchase-orders?${new URLSearchParams({
          ...(status ? { status } : {}),
          page: String(pageParam),
        }).toString()}`,
      );
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

/** How many purchases the shop holds: drafts for the Drafts segment's count, or every one (none yet says so). */
export function usePurchaseCount(which: 'drafts' | 'all') {
  return useQuery({
    queryKey: [...purchasesKey, which, 'count'],
    queryFn: () =>
      tenantSession.client.get<PurchasePage>(
        `/purchase-orders?${which === 'drafts' ? `status=${PurchaseStatus.Draft}&` : ''}limit=1`,
      ),
    select: (page) => page.total,
  });
}

/** GET /purchase-orders/:id: one purchase with its items, what names them, and its deliveries. */
export function usePurchase(id: string) {
  return useQuery({
    queryKey: [...purchasesKey, id],
    queryFn: () => tenantSession.client.get<Purchase>(`/purchase-orders/${id}`),
  });
}

/** One item as a purchase sends it: a variant, how many in its unit, and what one cost (left out is unknown). */
export interface PurchaseLine {
  variantId: string;
  quantity: number;
  unitCost?: number | null;
}

/** A purchase's details as sent: the supplier picked or typed, the expected day, notes, and its items. */
export interface PurchaseDraft {
  supplierId?: string | null;
  supplierName?: string;
  expectedOn?: string | null;
  notes?: string | null;
  items?: PurchaseLine[];
}

/** After a change: the purchase as the server answered, and its lists and the stock read again. */
function usePurchaseChanged(): (purchase?: Purchase) => void {
  const queryClient = useQueryClient();
  return (purchase) => {
    if (purchase) queryClient.setQueryData([...purchasesKey, purchase.id], purchase);
    void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
  };
}

/** POST /purchase-orders (PUR-02): a new purchase, saved as a draft. */
export function useCreatePurchase() {
  const changed = usePurchaseChanged();
  return useMutation({
    mutationFn: (body: PurchaseDraft & { items: PurchaseLine[] }) =>
      tenantSession.client.post<Purchase>('/purchase-orders', body),
    onSuccess: changed,
  });
}

/** PATCH /purchase-orders/:id (PUR-02): its details, and its items until the first delivery. */
export function useUpdatePurchase(id: string) {
  const changed = usePurchaseChanged();
  return useMutation({
    mutationFn: (body: PurchaseDraft) =>
      tenantSession.client.patch<Purchase>(`/purchase-orders/${id}`, body),
    onSuccess: changed,
  });
}

/** POST …/place (PUR-02, PUR-03): a draft placed with the supplier, numbered and counted as coming. */
export function usePlacePurchase() {
  const changed = usePurchaseChanged();
  return useMutation({
    mutationFn: (id: string) => tenantSession.client.post<Purchase>(`/purchase-orders/${id}/place`),
    onSuccess: changed,
  });
}

/** POST …/cancel (PUR-03): a placed purchase that nothing has arrived for, cancelled. */
export function useCancelPurchase(id: string) {
  const changed = usePurchaseChanged();
  return useMutation({
    mutationFn: () => tenantSession.client.post<Purchase>(`/purchase-orders/${id}/cancel`),
    onSuccess: changed,
  });
}

/** POST …/close (PUR-06): closed short once anything was delivered, what is outstanding dropped, its reason kept. */
export function useClosePurchase(id: string) {
  const changed = usePurchaseChanged();
  return useMutation({
    mutationFn: (reason: string) =>
      tenantSession.client.post<Purchase>(`/purchase-orders/${id}/close`, { reason }),
    onSuccess: changed,
  });
}

/** DELETE /purchase-orders/:id: a draft deleted for good. */
export function useDeleteDraft(id: string) {
  const changed = usePurchaseChanged();
  return useMutation({
    mutationFn: () => tenantSession.client.delete<{ ok: true }>(`/purchase-orders/${id}`),
    onSuccess: () => {
      changed();
    },
  });
}

/** One item as It arrived sends it (PUR-04, INV-12, INV-14). */
export interface ReceivedItem {
  itemId: string;
  accepted: number;
  rejected?: number;
  rejectReason?: string;
  unitCost?: number | null;
  batch?: { batchCode?: string; expiresOn?: string };
  serials?: string[];
}

/** POST …/receipts (PUR-04): one delivery, its accepted units into stock, its rejected ones still outstanding. */
export function useReceive(id: string) {
  const changed = usePurchaseChanged();
  return useMutation({
    mutationFn: (body: { items: ReceivedItem[]; note?: string }) =>
      tenantSession.client.post<Purchase>(`/purchase-orders/${id}/receipts`, body),
    onSuccess: changed,
  });
}

/** GET /suppliers (PUR-01): the live ones or the archived ones, found by name, A to Z. */
export function useSuppliers(options: { search?: string; archived?: boolean; enabled?: boolean }) {
  const search = (options.search ?? '').trim();
  return useQuery({
    queryKey: [...suppliersKey, search, options.archived ?? false],
    queryFn: () =>
      tenantSession.client.get<SupplierPage>(
        `/suppliers?${new URLSearchParams({
          ...(search ? { q: search } : {}),
          archived: String(options.archived ?? false),
          limit: '100',
        }).toString()}`,
      ),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

/** A supplier's details as sent; `archived` archives it or brings it back. */
export interface SupplierDraft {
  name?: string;
  phone?: string | null;
  email?: string | null;
  postalAddress?: string | null;
  notes?: string | null;
  archived?: boolean;
}

/** POST /suppliers (PUR-01): a new supplier. */
export function useCreateSupplier() {
  const changed = usePurchaseChanged();
  return useMutation({
    mutationFn: (body: SupplierDraft & { name: string }) =>
      tenantSession.client.post<Supplier>('/suppliers', body),
    onSuccess: () => {
      changed();
    },
  });
}

/** PATCH /suppliers/:id (PUR-01): its details, archived, or brought back; never deleted. */
export function useUpdateSupplier() {
  const changed = usePurchaseChanged();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SupplierDraft }) =>
      tenantSession.client.patch<Supplier>(`/suppliers/${id}`, body),
    onSuccess: () => {
      changed();
    },
  });
}

/** GET …/variants/:variantId/purchases (PUR-09): the deliveries that brought a variant in, newest first. */
export function usePurchaseHistory(productId: string, variantId: string | null) {
  return useInfiniteQuery({
    queryKey: [...purchasesKey, 'history', productId, variantId ?? ''],
    queryFn: ({ pageParam }) =>
      tenantSession.client.get<PurchaseHistoryPage>(
        `/products/${productId}/variants/${variantId ?? ''}/purchases?page=${String(pageParam)}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: variantId !== null,
  });
}

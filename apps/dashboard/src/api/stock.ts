import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SerialStatus } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { ProductStock } from '@/types/attribute';
import type { ProductBatches, SerialPage, StockHistoryPage } from '@/types/stock';
import { PRODUCTS_QUERY_KEY } from './catalogue';

// A product's stock as the Stock card and its sheets read and change it (TENANT-DASHBOARD-DESIGN §7.4, Slice 11.7c;
// INV-06, INV-09, INV-12 to INV-14). Viewing needs inventory:read, changing inventory:manage. The Stock page (11.9)
// reuses them.

const stockKey = (productId: string) => [...PRODUCTS_QUERY_KEY, 'stock', productId] as const;

/** After a change: the product's stock, its batches, serials and history, and the lists' stock states, read again. */
function useStockChanged(productId: string): (stock?: ProductStock) => void {
  const queryClient = useQueryClient();
  return (stock) => {
    if (stock) queryClient.setQueryData(stockKey(productId), stock);
    void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
  };
}

/** GET …/stock-history (INV-09): a variant's movements, newest first, a page at a time ("Show earlier"). */
export function useStockHistory(productId: string, variantId: string | null) {
  return useInfiniteQuery({
    queryKey: [...stockKey(productId), 'history', variantId ?? ''],
    queryFn: ({ pageParam }) =>
      tenantSession.client.get<StockHistoryPage>(
        `/products/${productId}/variants/${variantId ?? ''}/stock-history?page=${String(pageParam)}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: variantId !== null,
  });
}

/** GET /products/:id/batches (INV-12, INV-13): the batches holding stock, in picking order. */
export function useProductBatches(productId: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: [...stockKey(productId), 'batches'],
    queryFn: () => tenantSession.client.get<ProductBatches>(`/products/${productId}/batches`),
    enabled: options.enabled,
  });
}

/** GET …/serials (INV-14): one page of a variant's serials in one status. */
export function useSerials(productId: string, variantId: string | null, status: SerialStatus) {
  return useQuery({
    queryKey: [...stockKey(productId), 'serials', variantId ?? '', status],
    queryFn: () =>
      tenantSession.client.get<SerialPage>(
        `/products/${productId}/variants/${variantId ?? ''}/serials?status=${status}&limit=100`,
      ),
    enabled: variantId !== null,
  });
}

/** What stock arriving carries (INV-06, INV-10, INV-12, INV-14, PUR-07): how much, and what is known of it. */
export interface StockAddition {
  quantity: number;
  unitCost?: number;
  supplierName?: string;
  batch?: { batchCode?: string; expiresOn?: string };
  serials?: string[];
}

/** POST …/stock-additions: stock that arrived, recorded as a purchase received in full. */
export function useAddStock(productId: string) {
  const changed = useStockChanged(productId);
  return useMutation({
    mutationFn: ({ variantId, body }: { variantId: string; body: StockAddition }) =>
      tenantSession.client.post<ProductStock>(
        `/products/${productId}/variants/${variantId}/stock-additions`,
        body,
      ),
    onSuccess: changed,
  });
}

/** POST …/batches/:batchId/write-off (INV-13): what an expired batch holds, written off. */
export function useWriteOff(productId: string) {
  const changed = useStockChanged(productId);
  return useMutation({
    mutationFn: (batchId: string) =>
      tenantSession.client.post<ProductBatches>(
        `/products/${productId}/batches/${batchId}/write-off`,
      ),
    onSuccess: () => {
      changed();
    },
  });
}

/** POST …/serials (INV-14): serials for units already held that have none yet. */
export function useAddSerials(productId: string) {
  const changed = useStockChanged(productId);
  return useMutation({
    mutationFn: ({ variantId, serials }: { variantId: string; serials: string[] }) =>
      tenantSession.client.post<SerialPage>(
        `/products/${productId}/variants/${variantId}/serials`,
        { serials },
      ),
    onSuccess: () => {
      changed();
    },
  });
}

/** PATCH …/serials/:serialId (INV-14): a serial typed wrong, corrected while its unit is in stock. */
export function useFixSerial(productId: string) {
  const changed = useStockChanged(productId);
  return useMutation({
    mutationFn: ({ serialId, serial }: { serialId: string; serial: string }) =>
      tenantSession.client.patch<unknown>(`/products/${productId}/serials/${serialId}`, { serial }),
    onSuccess: () => {
      changed();
    },
  });
}

/** DELETE …/serials/:serialId (INV-14): a serial taken off a unit in stock, which then has none. */
export function useRemoveSerial(productId: string) {
  const changed = useStockChanged(productId);
  return useMutation({
    mutationFn: (serialId: string) =>
      tenantSession.client.delete<{ ok: true }>(`/products/${productId}/serials/${serialId}`),
    onSuccess: () => {
      changed();
    },
  });
}

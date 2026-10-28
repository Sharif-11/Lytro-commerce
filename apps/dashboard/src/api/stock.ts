import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { BatchState, type SerialStatus, type StockEditReason } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { ProductStock } from '@/types/attribute';
import type {
  BatchCount,
  InventoryFigures,
  ProductBatches,
  SerialPage,
  StockHistoryPage,
  StockPage,
} from '@/types/stock';
import { PRODUCTS_QUERY_KEY } from './catalogue';

// A product's stock as the Stock card and its sheets read and change it (TENANT-DASHBOARD-DESIGN §7.4, Slice 11.7c;
// INV-06, INV-09, INV-12 to INV-14). Viewing needs inventory:read, changing inventory:manage. The Stock page (11.9)
// reuses them, and reads the shop's products a page at a time, its figures and its expiring batches (§7.7).

const stockKey = (productId: string) => [...PRODUCTS_QUERY_KEY, 'stock', productId] as const;

/** After a change: the product's stock, its batches, serials and history, and the lists' stock states, read again. */
function useStockChanged(productId: string): (stock?: ProductStock) => void {
  const queryClient = useQueryClient();
  return (stock) => {
    if (stock) queryClient.setQueryData(stockKey(productId), stock);
    void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
  };
}

/** The Stock page's segments (INV-08): every product, or the active ones low or out, as the Products list counts them. */
export const STOCK_SEGMENTS = ['all', 'low', 'out'] as const;
export type StockSegment = (typeof STOCK_SEGMENTS)[number];

/** GET /inventory/stock (Slice 11.9): the products found by name, out and low first, a page at a time ("Show more"). */
export function useStockPage(search: string, segment: StockSegment) {
  const found = search.trim();
  return useInfiniteQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'stock-page', found, segment],
    queryFn: ({ pageParam }) =>
      tenantSession.client.get<StockPage>(
        `/inventory/stock?${new URLSearchParams({
          ...(found ? { search: found } : {}),
          ...(segment === 'all' ? {} : { stock: segment }),
          page: String(pageParam),
        }).toString()}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

/** The most the server gives in one page, so a category's products come in as few reads as can be. */
const WHOLE_PAGE = 100;

/**
 * GET /inventory/stock?categoryId= (design v3.8): every product filed in a category, for a stock check counting it
 * whole; null asks for none.
 */
export function useCategoryStock(categoryId: string | null) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'stock-page', 'category', categoryId ?? ''],
    queryFn: async () => {
      const products: StockPage['products'] = [];
      for (let page = 1; ; page += 1) {
        const read = await tenantSession.client.get<StockPage>(
          `/inventory/stock?${new URLSearchParams({
            categoryId: categoryId ?? '',
            page: String(page),
            limit: String(WHOLE_PAGE),
          }).toString()}`,
        );
        products.push(...read.products);
        if (read.page >= read.pages) return products;
      }
    },
    enabled: categoryId !== null,
  });
}

/** GET /inventory/figures (INV-18, D3-9): stock value now, and this month's cost of goods sold and losses. */
export function useInventoryFigures(options: { enabled: boolean }) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'figures'],
    queryFn: () => tenantSession.client.get<InventoryFigures>('/inventory/figures'),
    enabled: options.enabled,
  });
}

/** GET /batches?state=expiring (INV-13): how many of the shop's batches expire within 30 days. */
export function useExpiringCount(options: { enabled: boolean }) {
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'batches', BatchState.Expiring, 'count'],
    queryFn: () =>
      tenantSession.client.get<BatchCount>(`/batches?state=${BatchState.Expiring}&limit=1`),
    select: (page) => page.total,
    enabled: options.enabled,
  });
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

/** GET /products/:id/batches for several products at once (a stock check's batch-by-batch lines), as each one reads. */
export function useBatchesOf(productIds: readonly string[]) {
  return useQueries({
    queries: productIds.map((productId) => ({
      queryKey: [...stockKey(productId), 'batches'],
      queryFn: () => tenantSession.client.get<ProductBatches>(`/products/${productId}/batches`),
    })),
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

/**
 * What Edit stock sends (INV-06, INV-12, INV-14): the number now held, why it changed, a note; on a product kept in
 * batches the batch a fall leaves or a rise joins (`batchId`), or the new batch a rise makes (`batch`); on a
 * serial-numbered one the IMEIs leaving.
 */
export interface StockEdit {
  onHand: number;
  reason: StockEditReason;
  note?: string;
  batchId?: string;
  batch?: { batchCode?: string; expiresOn?: string };
  serials?: string[];
}

/** PUT …/stock (INV-06): the stock now held, its difference recorded as one movement. */
export function useSetStock(productId: string) {
  const changed = useStockChanged(productId);
  return useMutation({
    mutationFn: ({ variantId, body }: { variantId: string; body: StockEdit }) =>
      tenantSession.client.put<ProductStock>(
        `/products/${productId}/variants/${variantId}/stock`,
        body,
      ),
    onSuccess: changed,
  });
}

/** PUT …/cost (INV-10): the average cost typed by hand, until a purchase with a cost sets it; null is unknown. */
export function useSetCost(productId: string) {
  const changed = useStockChanged(productId);
  return useMutation({
    mutationFn: ({ variantId, avgCost }: { variantId: string; avgCost: number | null }) =>
      tenantSession.client.put<ProductStock>(`/products/${productId}/variants/${variantId}/cost`, {
        avgCost,
      }),
    onSuccess: changed,
  });
}

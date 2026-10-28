import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { StockCheck, StockCheckPage } from '@/types/stock';
import { PRODUCTS_QUERY_KEY } from './catalogue';

// Stock checks (TENANT-DASHBOARD-DESIGN §7.8, Slice 11.9; INV-07): the shop's counts, newest first, one count with its
// lines, and a new one recorded. Reading needs inventory:read, counting inventory:manage. Kept under the products' key,
// so a count read again shows a change to stock made since.

const checksKey = [...PRODUCTS_QUERY_KEY, 'stock-checks'] as const;

/** GET /stock-checks: the shop's checks, newest first, a page at a time ("Show more"). */
export function useStockChecks() {
  return useInfiniteQuery({
    queryKey: checksKey,
    queryFn: ({ pageParam }) =>
      tenantSession.client.get<StockCheckPage>(`/stock-checks?page=${String(pageParam)}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
}

/** GET /stock-checks/:id: one check with its lines and what names them. */
export function useStockCheck(id: string) {
  return useQuery({
    queryKey: [...checksKey, id],
    queryFn: () => tenantSession.client.get<StockCheck>(`/stock-checks/${id}`),
  });
}

/** One counted line: a variant as a whole, or one batch of it; on a serial-numbered one, the IMEIs not found. */
export interface CountedLine {
  variantId: string;
  batchId?: string;
  counted: number;
  missingSerials?: string[];
}

/** POST /stock-checks (INV-07): each difference recorded as "counted again"; the stock and its lists read again. */
export function useRecordStockCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { lines: CountedLine[]; note?: string }) =>
      tenantSession.client.post<StockCheck>('/stock-checks', body),
    onSuccess: (check) => {
      queryClient.setQueryData([...checksKey, check.id], check);
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

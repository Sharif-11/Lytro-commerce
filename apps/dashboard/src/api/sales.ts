import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SalesBucket, SalesRanking } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { BestSellersRead, SalesRead } from '@/types/sales';

const SALES_QUERY_KEY = ['sales'] as const;

interface Days {
  from: string;
  to: string;
}

/** GET /sales (STA-01, STA-03): a period split by week, month, quarter or year; one product's, with `productId`. */
export function useSales(
  query: Days & { bucket: SalesBucket; productId?: string },
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...SALES_QUERY_KEY, query],
    queryFn: () =>
      tenantSession.client.get<SalesRead>(
        `/sales?${new URLSearchParams({
          dateFrom: query.from,
          dateTo: query.to,
          bucket: query.bucket,
          ...(query.productId ? { productId: query.productId } : {}),
        }).toString()}`,
      ),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** GET /sales/best-sellers (STA-02). */
export function useBestSellers(
  query: Days & { by: SalesRanking; limit: number },
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...SALES_QUERY_KEY, 'best-sellers', query],
    queryFn: () =>
      tenantSession.client.get<BestSellersRead>(
        `/sales/best-sellers?${new URLSearchParams({
          dateFrom: query.from,
          dateTo: query.to,
          by: query.by,
          limit: String(query.limit),
        }).toString()}`,
      ),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

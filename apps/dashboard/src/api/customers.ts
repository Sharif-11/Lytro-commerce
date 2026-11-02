import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { Customer, CustomerPage } from '@/types/customers';
import { CUSTOMERS_QUERY_KEY, ORDERS_QUERY_KEY } from './orders';

// Customers (TENANT-DASHBOARD-DESIGN §7.32, Slice 4.8b; CUS-01, CUS-02, CUS-09, CUS-14). Reading needs customers:read,
// a new password or the privacy delete customers:manage.

function pageOf(q: string, page: number, limit?: number): Promise<CustomerPage> {
  return tenantSession.client.get<CustomerPage>(
    `/customers?${new URLSearchParams({
      ...(q ? { q } : {}),
      page: String(page),
      ...(limit ? { limit: String(limit) } : {}),
    }).toString()}`,
  );
}

/** GET /customers (CUS-02): who ordered last first, found by name or any digits of the phone. */
export function useCustomers(q: string) {
  return useInfiniteQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, 'list', q],
    queryFn: ({ pageParam }) => pageOf(q, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

/** One search's customers (§7.32): the first few found, and how many in all. */
export function useCustomerSearch(q: string, limit: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, 'search', q, limit],
    queryFn: () => pageOf(q, 1, limit),
    enabled: (options.enabled ?? true) && q.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** GET /customers/:id (CUS-01, CUS-02): one customer with their last address and shopper account. */
export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, id],
    queryFn: () => tenantSession.client.get<Customer>(`/customers/${id ?? ''}`),
    enabled: id !== null,
  });
}

/** The customer a whole phone number belongs to, with where their latest delivery went: New order's known phone. */
export function useCustomerByPhone(phone: string | null) {
  const found = useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, 'phone', phone],
    queryFn: () => pageOf(phone ?? '', 1),
    select: (result) => result.customers.find((customer) => customer.phone === phone) ?? null,
    enabled: phone !== null,
  });
  return useCustomer(found.data?.id ?? null);
}

/** POST /customers/:id/password (CUS-14): a new password the shop tells them; all their sign-ins end. */
export function useSetShopperPassword(id: string) {
  return useMutation({
    mutationFn: (password: string) =>
      tenantSession.client.post<{ ok: true }>(`/customers/${id}/password`, { password }),
  });
}

/** DELETE /customers/:id (CUS-09): their details gone for good; their orders keep items and totals. */
export function useEraseCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tenantSession.client.delete<{ ok: true }>(`/customers/${id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [...CUSTOMERS_QUERY_KEY, id] });
      void queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
    },
  });
}

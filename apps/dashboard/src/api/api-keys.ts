import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateApiKeyInput } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { ApiKey, CreatedApiKey } from '@/types/api-key';

export const API_KEYS_QUERY_KEY = ['api-keys'] as const;

/** API-01: the shop's keys, newest first, revoked ones kept. */
export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ApiKey[]>('/api-keys'),
  });
}

/** API-01: a new key, its value answered this once. The expiry is an ISO moment, or left out for none. */
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; websites: string[]; expiresAt?: string }) =>
      tenantSession.client.post<CreatedApiKey>('/api-keys', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });
}

/** API-01, API-08: a live key's name or website addresses. */
export function useUpdateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateApiKeyInput & { id: string }) =>
      tenantSession.client.patch<ApiKey>(`/api-keys/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });
}

/** API-03: the key stops working at once, and stays in the list as revoked. */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tenantSession.client.post<ApiKey>(`/api-keys/${id}/revoke`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });
}

/** PYG-26 (PAYG-FAIR-USE-PLAN PF-36): what the shop's own website's API cost this cycle, day by day, and its cap. */
export interface ApiChargeSummary {
  applies: boolean;
  cycleStart: string;
  requests: number;
  free: number;
  rate: string;
  charged: string;
  cap: string;
  stopped: boolean;
  days: { day: string; requests: number; billable: number; charged: string }[];
}

export const API_CHARGES_QUERY_KEY = [...API_KEYS_QUERY_KEY, 'charges'] as const;

/** GET /api-keys/charges (PF-36): the API page's figures on pay-as-you-go. */
export function useApiCharges(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: API_CHARGES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ApiChargeSummary>('/api-keys/charges'),
    enabled: options.enabled ?? true,
  });
}

/** PUT /api-keys/cap (PF-36, PFQ-10): the most the website may be charged for API requests in a cycle, ৳0 to ৳5,000. */
export function useSetApiCap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cap: number) =>
      tenantSession.client.put<ApiChargeSummary>('/api-keys/cap', { cap }),
    onSuccess: (summary) => {
      queryClient.setQueryData(API_CHARGES_QUERY_KEY, summary);
    },
  });
}

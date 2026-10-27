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

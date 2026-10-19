import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddIdentityCodeInput,
  OauthProvider,
  VerifyAddIdentityInput,
} from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { CodeIssued } from '@/types/auth';
import type { Identity } from '@/types/identity';

export const IDENTITIES_QUERY_KEY = ['me', 'identities'] as const;

/** AUTH-26: the sign-in methods on the account. */
export function useIdentities(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: IDENTITIES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<{ identities: Identity[] }>('/me/identities'),
    enabled: options.enabled ?? true,
  });
}

export function useRequestIdentityCode() {
  return useMutation({
    mutationFn: (input: AddIdentityCodeInput) =>
      tenantSession.client.post<CodeIssued>('/me/identities/code', input),
  });
}

/** A value held by another account is refused with `conflict`. */
export function useVerifyIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VerifyAddIdentityInput) =>
      tenantSession.client.post<{ attached: true }>('/me/identities/verify', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: IDENTITIES_QUERY_KEY });
    },
  });
}

/** Sends the browser to the provider to attach a Google or Facebook account. */
export function useAttachOauth() {
  return useMutation({
    mutationFn: (provider: OauthProvider) =>
      tenantSession.client.post<{ url: string }>(`/me/identities/oauth/${provider}/start`),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
}

/** Refused with `conflict` when it is the last identity or when it owns a shop. */
export function useRemoveIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      tenantSession.client.request<{ ok: true }>(`/me/identities/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: IDENTITIES_QUERY_KEY });
    },
  });
}

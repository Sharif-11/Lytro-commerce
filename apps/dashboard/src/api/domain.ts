import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { DomainView } from '@/types/domain';
import { ME_QUERY_KEY } from './me';

export const DOMAIN_QUERY_KEY = ['domain'] as const;

/** TEN-09 to TEN-14: the shop's own domain, its state and records, and whether its plan includes one. */
export function useDomain() {
  return useQuery({
    queryKey: DOMAIN_QUERY_KEY,
    queryFn: () => tenantSession.client.get<DomainView>('/domain'),
  });
}

/** After any change: the page takes the answer, and /me's main address is read again (the shop's links follow it). */
function useAfterDomain(): (view: DomainView) => void {
  const queryClient = useQueryClient();
  return (view) => {
    queryClient.setQueryData(DOMAIN_QUERY_KEY, view);
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  };
}

/** TEN-09: adds the domain the seller bought; the server checks it once straight away. */
export function useAddDomain() {
  const after = useAfterDomain();
  return useMutation({
    mutationFn: (hostname: string) =>
      tenantSession.client.post<DomainView>('/domain', { hostname }),
    onSuccess: after,
  });
}

/** TEN-11: "Check now" -- a waiting domain's records looked for at once. */
export function useCheckDomain() {
  const after = useAfterDomain();
  return useMutation({
    mutationFn: () => tenantSession.client.post<DomainView>('/domain/check', {}),
    onSuccess: after,
  });
}

/** TEN-14: the shop stops answering on its domain at once. */
export function useRemoveDomain() {
  const after = useAfterDomain();
  return useMutation({
    mutationFn: () => tenantSession.client.delete<DomainView>('/domain'),
    onSuccess: after,
  });
}

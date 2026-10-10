import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in tenant's account summary — shared by the dashboard shell (branding, tab title) and any
    screen that shows account details, via TanStack Query's own cache (one request, however many callers). */
export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => tenantSession.refreshMe(),
  });
}

/** Ends the session and always returns to /sign-in — a failed signout call shouldn't trap the tenant on a
    screen they explicitly asked to leave, so the redirect happens either way (onSettled, not onSuccess). */
export function useSignOut() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/auth/signout'),
    onSettled: () => {
      tenantSession.clear();
      void navigate({ to: '/sign-in' });
    },
  });
}

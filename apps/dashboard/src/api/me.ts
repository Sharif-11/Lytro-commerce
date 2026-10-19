import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { signUpIntent } from '@/session/sign-up-intent';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in account and its shop, shared by every dashboard screen through the query cache. */
export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => tenantSession.refreshMe(),
  });
}

/** Ends the session and always returns to /sign-in: a failed sign-out call must not trap the person on a
    screen they asked to leave, so the redirect happens either way. */
export function useSignOut() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/auth/signout'),
    onSettled: () => {
      tenantSession.clear();
      signUpIntent.clear();
      void navigate({ to: '/sign-in', search: {} });
    },
  });
}

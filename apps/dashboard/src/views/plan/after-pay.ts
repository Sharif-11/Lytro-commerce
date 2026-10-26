import { useQueryClient } from '@tanstack/react-query';
import { ME_QUERY_KEY } from '@/api/me';
import { tenantSession } from '@/session/tenant-session';
import type { MeTenant } from '@/types/me';

/**
 * The shop as it stands after a payment went through: /me read again, for the toast's new date ("Renewed · runs until
 * 9 Dec 2026") and every screen after it.
 */
export function useShopAfterPayment(): () => Promise<MeTenant | null> {
  const queryClient = useQueryClient();
  return async () => {
    const me = await queryClient.query({
      queryKey: ME_QUERY_KEY,
      queryFn: () => tenantSession.refreshMe(),
      staleTime: 0,
    });
    return me.tenant;
  };
}

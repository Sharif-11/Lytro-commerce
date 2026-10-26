import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SetPackAutoBuyInput } from '@lytronix/validators';
import { USAGE_QUERY_KEY } from '@/api/usage';
import { tenantSession } from '@/session/tenant-session';
import type { AddonOffer } from '@/types/addons';

export const ADDONS_QUERY_KEY = ['addons'] as const;

/** PLN-13, PLN-14: what is for sale to the shop and what it costs now -- the names in both languages too. */
export function useAddonOffers() {
  return useQuery({
    queryKey: ADDONS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<AddonOffer[]>('/addons'),
  });
}

/** PLN-15: the auto-buy switches, either or both; the usage page and the add-ons read them again. */
export function useSetAutoBuy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetPackAutoBuyInput) =>
      tenantSession.client.patch('/addons/auto-buy', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ADDONS_QUERY_KEY });
    },
  });
}

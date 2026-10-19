import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShopSettings, UpdateShopSettingsInput } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';

export const SHOP_SETTINGS_QUERY_KEY = ['shop-settings'] as const;

/** TEN-30: the shop's contact details and its own extra-delivery-charge rate. */
export function useShopSettings() {
  return useQuery({
    queryKey: SHOP_SETTINGS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ShopSettings>('/shop-settings'),
  });
}

export function useUpdateShopSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateShopSettingsInput) =>
      tenantSession.client.patch<ShopSettings>('/shop-settings', input),
    onSuccess: (data) => {
      queryClient.setQueryData(SHOP_SETTINGS_QUERY_KEY, data);
    },
  });
}

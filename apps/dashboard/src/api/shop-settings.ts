import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MediaPurpose,
  type ShopSettings,
  type UpdateShopSettingsInput,
} from '@lytronix/validators';
import { ImageUpload } from '@/lib/image-upload';
import { tenantSession } from '@/session/tenant-session';
import { ME_QUERY_KEY } from './me';

export const SHOP_SETTINGS_QUERY_KEY = ['shop-settings'] as const;

const imageUpload = new ImageUpload(tenantSession.client);

/** TEN-30: the shop's contact details and its own extra-delivery-charge rate. */
export function useShopSettings() {
  return useQuery({
    queryKey: SHOP_SETTINGS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ShopSettings>('/shop-settings'),
  });
}

/** TEN-19, TEN-30: the shop's name and contact details; the shell, its tab title and new installs follow the name. */
export function useUpdateShopSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateShopSettingsInput) =>
      tenantSession.client.patch<ShopSettings>('/shop-settings', input),
    onSuccess: (data) => {
      queryClient.setQueryData(SHOP_SETTINGS_QUERY_KEY, data);
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

/** TEN-16 (MED-03): an image from the browser made the shop's logo, which the shell then shows. */
export function useSetLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const media = await imageUpload.upload(file, MediaPurpose.ShopLogo);
      return tenantSession.client.put<ShopSettings>('/shop-settings/logo', { mediaId: media.id });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SHOP_SETTINGS_QUERY_KEY });
    },
  });
}

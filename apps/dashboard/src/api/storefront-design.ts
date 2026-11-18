import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ShopSettings,
  StorefrontCardOrderInput,
  StorefrontDesign,
} from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { PreviewLink, StorefrontCards, StorefrontEditor } from '@/types/storefront-design';
import { ME_QUERY_KEY } from './me';
import { SHOP_SETTINGS_QUERY_KEY } from './shop-settings';

// STOREFRONT-BUILDER-PLAN SB-5, SB-12, SB-13: the storefront design editor's reads and writes.

export const DESIGN_QUERY_KEY = ['storefront-design'] as const;

/** SB-12: the design to edit -- the draft, else the live one, else the shop type's starting one. */
export function useStorefrontEditor() {
  return useQuery({
    queryKey: DESIGN_QUERY_KEY,
    queryFn: () => tenantSession.client.get<StorefrontEditor>('/storefront/design'),
  });
}

/** Every write answers with the editor's read, which the screen then shows. */
function useAfterDesign(): (editor: StorefrontEditor) => void {
  const queryClient = useQueryClient();
  return (editor) => {
    queryClient.setQueryData(DESIGN_QUERY_KEY, editor);
  };
}

/** SB-12: the draft saved whole, on the server, so a phone and a desktop see one draft. */
export function useSaveDraft() {
  const after = useAfterDesign();
  return useMutation({
    mutationFn: (design: StorefrontDesign) =>
      tenantSession.client.put<StorefrontEditor>('/storefront/design', { design }),
    onSuccess: after,
  });
}

/** SB-12: the draft dropped, back to the live design. */
export function useDiscardDraft() {
  const after = useAfterDesign();
  return useMutation({
    mutationFn: () => tenantSession.client.delete<StorefrontEditor>('/storefront/design/draft'),
    onSuccess: after,
  });
}

/** SB-12, SB-13: the draft made live; shoppers see it within a minute. */
export function usePublishDesign() {
  const after = useAfterDesign();
  return useMutation({
    mutationFn: () => tenantSession.client.post<StorefrontEditor>('/storefront/design/publish', {}),
    onSuccess: after,
  });
}

/** SB-12, SB-25: the design before the live one, live again (a draft is dropped with it). */
export function useBackDesign() {
  const after = useAfterDesign();
  return useMutation({
    mutationFn: () => tenantSession.client.post<StorefrontEditor>('/storefront/design/back', {}),
    onSuccess: after,
  });
}

/** SB-12: a short-lived signed link to the draft, for the preview. */
export function usePreviewLink() {
  return useMutation({
    mutationFn: () => tenantSession.client.post<PreviewLink>('/storefront/design/preview', {}),
  });
}

/** SB-5: the shop's square icon (every plan), set to an image already uploaded, or none. */
export function useSetIcon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string | null) =>
      tenantSession.client.put<ShopSettings>('/shop-settings/icon', { mediaId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SHOP_SETTINGS_QUERY_KEY });
    },
  });
}

/** TEN-16: the shop's logo set to an image already uploaded, or none. */
export function useSetLogoImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string | null) =>
      tenantSession.client.put<ShopSettings>('/shop-settings/logo', { mediaId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SHOP_SETTINGS_QUERY_KEY });
    },
  });
}

export const CARDS_QUERY_KEY = ['storefront-cards'] as const;

/** DC-2, DC-6: the switch, and every card of the shop in its default lists' order. */
export function useStorefrontCards() {
  return useQuery({
    queryKey: CARDS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<StorefrontCards>('/storefront/design/cards'),
  });
}

/** DC-6, DC-8: the seller's order and each product's way, whole; live at once. */
export function useSaveCardOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StorefrontCardOrderInput) =>
      tenantSession.client.put<StorefrontCards>('/storefront/design/cards/order', input),
    onSuccess: (cards) => {
      queryClient.setQueryData(CARDS_QUERY_KEY, cards);
    },
  });
}

/** DC-2: each design its own card, or one card per product; live at once. */
export function useSetDesignCards() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) =>
      tenantSession.client.put<StorefrontCards>('/storefront/design/cards/designs', { on }),
    onSuccess: (cards) => {
      queryClient.setQueryData(CARDS_QUERY_KEY, cards);
    },
  });
}

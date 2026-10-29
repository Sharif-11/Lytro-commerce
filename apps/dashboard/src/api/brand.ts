import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaveBrandInput } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { BrandEditor } from '@/types/brand';
import { ME_QUERY_KEY } from './me';

export const BRAND_QUERY_KEY = ['brand'] as const;

/** BRN-02, BRN-03, BRN-05: the shop's identity, its switch, whether it may show, and its contrast check. */
export function useBrandEditor() {
  return useQuery({
    queryKey: BRAND_QUERY_KEY,
    queryFn: () => tenantSession.client.get<BrandEditor>('/brand'),
  });
}

/** After a save or a switch: the editor takes the answer, and /me's live identity is read again (BRN-07). */
function useAfterBrand(): (editor: BrandEditor) => void {
  const queryClient = useQueryClient();
  return (editor) => {
    queryClient.setQueryData(BRAND_QUERY_KEY, editor);
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  };
}

/** BRN-02, BRN-03: the identity saved whole; `useBrand: true` is Apply, left out the switch stays as it is. */
export function useSaveBrand() {
  const after = useAfterBrand();
  return useMutation({
    mutationFn: (input: SaveBrandInput) => tenantSession.client.put<BrandEditor>('/brand', input),
    onSuccess: after,
  });
}

/** BRN-02: "Use my brand" turned off (or on), keeping the identity. */
export function useSwitchBrand() {
  const after = useAfterBrand();
  return useMutation({
    mutationFn: (useBrand: boolean) =>
      tenantSession.client.put<BrandEditor>('/brand/switch', { useBrand }),
    onSuccess: after,
  });
}

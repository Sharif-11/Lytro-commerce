import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateAddonInput, UpdateAddonInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { OperatorAddon } from '@/types/operator';

const ADDONS_QUERY_KEY = ['operator', 'addons'] as const;

/** PLN-13: the catalogue, retired items included, with how many are running. */
export function useAddons() {
  return useQuery({
    queryKey: ADDONS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<OperatorAddon[]>('/operator/addons'),
  });
}

export function useCreateAddon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAddonInput) => operatorSession.client.post('/operator/addons', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADDONS_QUERY_KEY }),
  });
}

/** A new price applies to the next purchase; what shops bought keeps its own. */
export function useUpdateAddon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAddonInput & { id: string }) =>
      operatorSession.client.patch(`/operator/addons/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADDONS_QUERY_KEY }),
  });
}

/** No shop can buy it from now; what they bought runs to its end. */
export function useRetireAddon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => operatorSession.client.post(`/operator/addons/${id}/retire`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADDONS_QUERY_KEY }),
  });
}

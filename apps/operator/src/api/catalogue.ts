import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateAttributeInput,
  CreateOptionInput,
  CreatePlatformOptionSetInput,
  UpdateAttributeInput,
  UpdateOptionInput,
  UpdatePlatformOptionSetInput,
  UpdatePresetInput,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { LibraryAttribute, LibraryOptionSet, ShopTypePreset } from '@/types/operator';

const PRESETS_QUERY_KEY = ['operator', 'presets'] as const;
const ATTRIBUTES_QUERY_KEY = ['operator', 'attributes'] as const;
const OPTION_SETS_QUERY_KEY = ['operator', 'option-sets'] as const;

/** PST-02: the shop types and what a new product starts with in each. */
export function usePresets() {
  return useQuery({
    queryKey: PRESETS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<ShopTypePreset[]>('/operator/presets'),
  });
}

/** PST-03: applies to the next product created, never to an existing one. */
export function useUpdatePreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...input }: UpdatePresetInput & { key: string }) =>
      operatorSession.client.patch(`/operator/presets/${key}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRESETS_QUERY_KEY }),
  });
}

/** ATL-01: the attributes every shop sees, with their values, retired ones too. */
export function useAttributes() {
  return useQuery({
    queryKey: ATTRIBUTES_QUERY_KEY,
    queryFn: () => operatorSession.client.get<LibraryAttribute[]>('/operator/attributes'),
  });
}

export function useCreateAttribute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAttributeInput) =>
      operatorSession.client.post<LibraryAttribute>('/operator/attributes', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ATTRIBUTES_QUERY_KEY }),
  });
}

export function useUpdateAttribute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAttributeInput & { id: string }) =>
      operatorSession.client.patch(`/operator/attributes/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ATTRIBUTES_QUERY_KEY }),
  });
}

export function useAddOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attributeId, ...input }: CreateOptionInput & { attributeId: string }) =>
      operatorSession.client.post(`/operator/attributes/${attributeId}/options`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ATTRIBUTES_QUERY_KEY }),
  });
}

export function useUpdateOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      attributeId,
      optionId,
      ...input
    }: UpdateOptionInput & { attributeId: string; optionId: string }) =>
      operatorSession.client.patch(
        `/operator/attributes/${attributeId}/options/${optionId}`,
        input,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ATTRIBUTES_QUERY_KEY }),
  });
}

/** ATR-16: values a shop inserts in one tap. */
export function useOptionSets() {
  return useQuery({
    queryKey: OPTION_SETS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<LibraryOptionSet[]>('/operator/option-sets'),
  });
}

export function useCreateOptionSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlatformOptionSetInput) =>
      operatorSession.client.post('/operator/option-sets', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: OPTION_SETS_QUERY_KEY }),
  });
}

export function useUpdateOptionSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePlatformOptionSetInput & { id: string }) =>
      operatorSession.client.patch(`/operator/option-sets/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: OPTION_SETS_QUERY_KEY }),
  });
}

/** Values shops already inserted from it stay theirs. */
export function useDeleteOptionSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => operatorSession.client.delete(`/operator/option-sets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: OPTION_SETS_QUERY_KEY }),
  });
}

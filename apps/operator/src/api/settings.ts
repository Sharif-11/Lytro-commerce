import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateSettingInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { PlatformSetting } from '@/types/operator';

export const SETTINGS_QUERY_KEY = ['operator', 'settings'] as const;

/** LIF-26: every platform-wide editable value that is not a per-use rate. */
export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<PlatformSetting[]>('/operator/settings'),
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...input }: UpdateSettingInput & { key: string }) =>
      operatorSession.client.patch<{ ok: true }>(`/operator/settings/${key}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });
}

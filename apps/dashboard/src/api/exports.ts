import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import { downloadFile } from './download';
import type { DataExport } from '@/types/data-export';

export const EXPORTS_QUERY_KEY = ['exports'] as const;

// While an export is being made the screen looks again this often (decided for Slice 11.5b).
const PREPARING_POLL_MS = 30_000;

/** LIF-16: the owner's export requests, newest first; read again every 30 seconds while one is being made. */
export function useExports(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: EXPORTS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<DataExport[]>('/exports'),
    enabled: options.enabled ?? true,
    refetchInterval: (query) =>
      query.state.data?.some((each) => each.status === 'pending') ? PREPARING_POLL_MS : false,
  });
}

export function useRequestExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tenantSession.client.post<DataExport>('/exports'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EXPORTS_QUERY_KEY });
    },
  });
}

/** A ready export's file, for the shop the owner is on (KNOWN-GAPS §113). */
export async function downloadExport(id: string): Promise<void> {
  await downloadFile(`/exports/${encodeURIComponent(id)}/download`, `data-export-${id}.zip`);
}

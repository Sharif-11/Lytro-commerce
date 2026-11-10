import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EvidenceContentType,
  ManualEntryKind,
  ManualEntryPreviewInput,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type {
  EvidenceLink,
  EvidenceUpload,
  ManualEntry,
  ManualEntryPage,
  ManualEntryPreview,
} from '@/types/manual-entries';

export const MANUAL_ENTRIES_QUERY_KEY = ['operator', 'manual-entries'] as const;

/** D8-55: what the list filters on. */
export interface ManualEntryFilters {
  tenantId?: string;
  operatorId?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

function queryOf(filters: ManualEntryFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

/** ADM-16, D8-55: every entry and reversal, newest first, by shop, operator and day. */
export function useManualEntries(filters: ManualEntryFilters) {
  return useQuery({
    queryKey: [...MANUAL_ENTRIES_QUERY_KEY, 'list', filters],
    queryFn: () =>
      operatorSession.client.get<ManualEntryPage>(`/operator/manual-entries?${queryOf(filters)}`),
    placeholderData: keepPreviousData,
  });
}

/** ADM-14, D8-51: the entry as it would be for this shop now, priced by the seller's own code. */
export function useEntryPreview(input: ManualEntryPreviewInput | null) {
  return useQuery({
    queryKey: [...MANUAL_ENTRIES_QUERY_KEY, 'preview', input],
    queryFn: () =>
      operatorSession.client.post<ManualEntryPreview>('/operator/manual-entries/preview', input),
    enabled: input !== null,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/** POST /operator/manual-entries as the console sends it: exactly one of `walletId` and `bankAccountId` (D8-75). */
export interface RecordEntryBody {
  tenantId: string;
  kind: ManualEntryKind;
  planId?: string;
  billingTermId?: string;
  amount: number;
  amountConfirmation?: number;
  walletId?: string;
  bankAccountId?: string;
  transactionId: string;
  senderNumber?: string;
  paidAt: string;
  evidenceKey?: string;
  evidenceLine?: string;
  reason: string;
}

/** ADM-14, D8-47: sends a screenshot to its five-minute signed link and answers the key the entry names. */
export async function uploadEvidence(file: File): Promise<string> {
  const started = await operatorSession.client.post<EvidenceUpload>(
    '/operator/manual-entries/evidence',
    { contentType: file.type as EvidenceContentType, bytes: file.size },
  );
  const sent = await fetch(started.upload.url, {
    method: started.upload.method,
    headers: started.upload.headers,
    body: file,
  });
  if (!sent.ok) throw new Error(`the screenshot was refused: ${String(sent.status)}`);
  return started.key;
}

export function useRecordEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordEntryBody) =>
      operatorSession.client.post<ManualEntry>('/operator/manual-entries', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MANUAL_ENTRIES_QUERY_KEY });
    },
  });
}

/** ADM-15: a reversing entry; the original stays. */
export function useReverseEntry(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      operatorSession.client.post<ManualEntry>(`/operator/manual-entries/${id}/reverse`, {
        reason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MANUAL_ENTRIES_QUERY_KEY });
    },
  });
}

/** D8-47: a five-minute link to an entry's screenshot, read when the operator opens it. */
export function useEntryEvidence(id: string | null) {
  return useQuery({
    queryKey: [...MANUAL_ENTRIES_QUERY_KEY, 'evidence', id],
    queryFn: () =>
      operatorSession.client.get<EvidenceLink>(`/operator/manual-entries/${id ?? ''}/evidence`),
    enabled: id !== null,
    retry: false,
    // The link lasts five minutes; a later opening asks for a fresh one.
    gcTime: 0,
    staleTime: 0,
  });
}

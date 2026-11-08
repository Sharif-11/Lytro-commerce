import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NoticeAudience, NoticeCategory, NoticeSeverity } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type {
  NoticeAcknowledgments,
  NoticeDraft,
  NoticePage,
  NoticeTemplateRequest,
  NoticeWrite,
  OperatorNotice,
  OperatorNoticeDetail,
} from '@/types/notices';

export const NOTICES_QUERY_KEY = ['operator', 'notices'] as const;
const noticeKey = (id: string) => [...NOTICES_QUERY_KEY, 'one', id] as const;
const PAGE_SIZE = 50;

/** NTC-09: every notice, newest written first, by category or words. */
export function useNotices(filter: { category: NoticeCategory | null; q: string }) {
  return useQuery({
    queryKey: [...NOTICES_QUERY_KEY, 'list', filter.category, filter.q],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (filter.category) params.set('category', filter.category);
      if (filter.q.trim()) params.set('q', filter.q.trim());
      return operatorSession.client.get<NoticePage>(`/operator/notices?${params.toString()}`);
    },
  });
}

/** One notice with its earlier versions (NTC-08). */
export function useNotice(id: string) {
  return useQuery({
    queryKey: noticeKey(id),
    queryFn: () => operatorSession.client.get<OperatorNoticeDetail>(`/operator/notices/${id}`),
  });
}

/** NTC-05: who said "I understand", and who is still to. */
export function useNoticeAcknowledgments(id: string, enabled = true) {
  return useQuery({
    queryKey: [...noticeKey(id), 'acknowledgments'],
    queryFn: () =>
      operatorSession.client.get<NoticeAcknowledgments>(`/operator/notices/${id}/acknowledgments`),
    enabled,
  });
}

/** NTC-12: a template filled in, in both languages. */
export function useNoticeTemplate(request: NoticeTemplateRequest | null) {
  return useQuery({
    queryKey: [...NOTICES_QUERY_KEY, 'template', request],
    queryFn: () => operatorSession.client.post<NoticeDraft>('/operator/notices/template', request),
    enabled: request !== null,
    staleTime: Infinity,
    gcTime: 0,
  });
}

/** NTC-02: how many shops an audience takes in now, before it is saved. */
export function useNoticeReach(input: { audience: NoticeAudience; severity: NoticeSeverity }) {
  return useQuery({
    queryKey: [...NOTICES_QUERY_KEY, 'reach', input],
    queryFn: () => operatorSession.client.post<{ shops: number }>('/operator/notices/reach', input),
  });
}

/** Every list and page of notices reads again: a change shows wherever it is open. */
function useRefresh(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY });
  };
}

/** NTC-01: a new notice, a draft until it names when it goes live. */
export function useCreateNotice() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: NoticeWrite) =>
      operatorSession.client.post<OperatorNotice>('/operator/notices', input),
    onSuccess: refresh,
  });
}

/** NTC-08: a change; once live it keeps the version it replaces and sends nothing again. */
export function useUpdateNotice() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, ...input }: NoticeWrite & { id: string }) =>
      operatorSession.client.patch<OperatorNotice>(`/operator/notices/${id}`, input),
    onSuccess: refresh,
  });
}

/** NTC-08: hidden from every shop at once, kept here. */
export function useWithdrawNotice() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.post<OperatorNotice>(`/operator/notices/${id}/withdraw`),
    onSuccess: refresh,
  });
}

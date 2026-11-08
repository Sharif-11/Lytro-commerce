import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NoticeCategory } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { NoticeBoardPage, NoticeSummary, NoticeView } from '@/types/notices';

// Lytro's notices to the shop (TENANT-DASHBOARD-DESIGN §7.40, Part 37; NTC-01 to NTC-19, D7-53 to D7-59): the board, a
// notice, and the summary every page reads for its badge, marquee, prompt, countdown and "I understand". Each answer is in
// the page's language, so the language is part of every key.

export const NOTICES_QUERY_KEY = ['notices'] as const;

/** How often the summary is read again while a page is open: an urgent notice reaches an open page within a minute. */
const SUMMARY_REFRESH_MS = 60_000;

/** GET /notices/summary (NTC-03, NTC-04, NTC-05, NTC-14). */
export function useNoticeSummary(options: { enabled?: boolean } = {}) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: [...NOTICES_QUERY_KEY, 'summary', i18n.language],
    queryFn: () => tenantSession.client.get<NoticeSummary>('/notices/summary'),
    enabled: options.enabled ?? true,
    refetchInterval: SUMMARY_REFRESH_MS,
  });
}

const PAGE = 20;

/** GET /notices (NTC-03): pinned first, then newest, by category or words, a page at a time. */
export function useNoticeBoard(filter: { category: NoticeCategory | null; q: string }) {
  const { i18n } = useTranslation();
  return useInfiniteQuery({
    queryKey: [...NOTICES_QUERY_KEY, 'board', i18n.language, filter.category, filter.q],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(PAGE), offset: String(pageParam) });
      if (filter.category) query.set('category', filter.category);
      if (filter.q.trim()) query.set('q', filter.q.trim());
      return tenantSession.client.get<NoticeBoardPage>(`/notices?${query.toString()}`);
    },
    getNextPageParam: (last) => last.next ?? undefined,
  });
}

/** GET /notices/:id. */
export function useNotice(id: string) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: [...NOTICES_QUERY_KEY, 'one', i18n.language, id],
    queryFn: () => tenantSession.client.get<NoticeView>(`/notices/${encodeURIComponent(id)}`),
  });
}

function useNoticesChanged(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY });
  };
}

/** POST /notices/:id/read (NTC-09): the person opened it. */
export function useMarkNoticeRead() {
  const changed = useNoticesChanged();
  return useMutation({
    mutationFn: (id: string) =>
      tenantSession.client.post<{ unread: number }>(`/notices/${encodeURIComponent(id)}/read`),
    onSuccess: changed,
  });
}

/** POST /notices/:id/dismiss (NTC-04): the person closed its banner or its prompt; it stays unread. */
export function useDismissNotice() {
  const changed = useNoticesChanged();
  return useMutation({
    mutationFn: (id: string) =>
      tenantSession.client.post<{ ok: true }>(`/notices/${encodeURIComponent(id)}/dismiss`),
    onSuccess: changed,
  });
}

/** POST /notices/:id/acknowledge (NTC-05): the owner's "I understand", once for the shop. */
export function useAcknowledgeNotice() {
  const changed = useNoticesChanged();
  return useMutation({
    mutationFn: (id: string) =>
      tenantSession.client.post<{ acknowledgedAt: string }>(
        `/notices/${encodeURIComponent(id)}/acknowledge`,
      ),
    onSuccess: changed,
  });
}

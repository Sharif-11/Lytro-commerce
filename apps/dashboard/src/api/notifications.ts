import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NotificationKind } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { NotificationPage, NotificationSwitch, PushTestResult } from '@/types/notifications';
import { ME_QUERY_KEY } from './me';

// The bell, its switches and push on this device (TENANT-DASHBOARD-DESIGN §7.40, Part 37 (b); NTF-01 to NTF-04, D7-39 to
// D7-41). Every route is the signed-in person's own. The rows come in the page's language.

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

/** How often the bell's badge is read again while a page is open. */
const BELL_REFRESH_MS = 60_000;

/** GET /notifications (NTF-01): newest first, with the badge's count; `limit` for the panel, more pages for the page. */
export function useNotifications(options: { limit?: number; enabled?: boolean } = {}) {
  const { i18n } = useTranslation();
  const limit = options.limit ?? 30;
  return useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, 'list', i18n.language, limit],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (pageParam) query.set('before', pageParam);
      return tenantSession.client.get<NotificationPage>(`/notifications?${query.toString()}`);
    },
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: options.enabled ?? true,
    refetchInterval: BELL_REFRESH_MS,
  });
}

/** POST /notifications/read: some of the person's notifications, or all of them. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (which: string[] | 'all') =>
      tenantSession.client.post<{ marked: number; unread: number }>(
        '/notifications/read',
        which === 'all' ? { all: true } : { notificationIds: which },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/** GET /notifications/preferences (NTF-04): the kinds the person hears, each on or off, locked ones always on. */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, 'preferences'],
    queryFn: () =>
      tenantSession.client.get<{ kinds: NotificationSwitch[] }>('/notifications/preferences'),
    select: (found) => found.kinds,
  });
}

/** PUT /notifications/preferences: the whole list the person switches off. */
export function useSaveNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (off: NotificationKind[]) =>
      tenantSession.client.put<{ kinds: NotificationSwitch[] }>('/notifications/preferences', {
        off,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData([...NOTIFICATIONS_QUERY_KEY, 'preferences'], saved);
    },
  });
}

/** GET /push/key (NTF-02): Lytro's public key a browser subscribes with; null where push isn't set up. */
export function usePushKey() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, 'push-key'],
    queryFn: () => tenantSession.client.get<{ publicKey: string | null }>('/push/key'),
    select: (found) => found.publicKey,
    staleTime: Infinity,
  });
}

/** POST /push/subscriptions: this browser's subscription, as PushSubscription.toJSON() gives it. */
export function subscribePush(
  subscription: PushSubscriptionJSON,
): Promise<{ subscribed: boolean }> {
  return tenantSession.client.post<{ subscribed: boolean }>('/push/subscriptions', subscription);
}

/** POST /push/subscriptions/check: whether this browser is subscribed for the person signed in, in this shop. */
export function checkPush(endpoint: string): Promise<{ subscribed: boolean }> {
  return tenantSession.client.post<{ subscribed: boolean }>('/push/subscriptions/check', {
    endpoint,
  });
}

/** DELETE /push/subscriptions: stops pushing to this browser. */
export function unsubscribePush(endpoint: string): Promise<{ subscribed: boolean }> {
  return tenantSession.client.request<{ subscribed: boolean }>('/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}

/** POST /push/test: a test to each of the person's browsers. */
export function useTestPush() {
  return useMutation({
    mutationFn: () => tenantSession.client.post<PushTestResult>('/push/test'),
  });
}

/** PUT /me/language (I18N-01, D7-41): the language the person's email and push come in. */
export function useSaveLanguage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (language: 'bn' | 'en') =>
      tenantSession.client.put<{ language: 'bn' | 'en'; kept: boolean }>('/me/language', {
        language,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NOTIFICATIONS_QUERY_KEY, useNotifications } from '@/api/notifications';
import { notificationSound } from '@/lib/notification-sound';
import { PANEL_ROWS } from './bell';

/** What the push worker (public/push-sw.js) tells an open dashboard when a push arrives. */
export const PUSH_ARRIVED = 'lytro:push';

/** The installed app's icon count, where the browser has it at all. */
interface Badging {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * The owner, 2026-11-19 (the sketch's `snd-prefs`), mounted once in the shell: the chime when a newer unread
 * notification comes; a push reloads the bell at once rather than at its next minute; and where the device shows a
 * count on the installed app's icon (Windows, a Mac, an iPhone's Home Screen; Android shows only a dot, from the
 * notification itself), the unread count.
 */
export function NotificationAlerts(): null {
  const queryClient = useQueryClient();
  const list = useNotifications({ limit: PANEL_ROWS });
  const page = list.data?.pages[0];
  const newest = page?.items[0];
  // The newest seen so far; undefined until the first answer, which is never announced.
  const seen = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    notificationSound.wakeOn(window);
  }, []);

  useEffect(() => {
    if (!page) return;
    const latest = newest?.createdAt ?? null;
    if (
      seen.current !== undefined &&
      newest !== undefined &&
      !newest.read &&
      latest !== null &&
      (seen.current === null || latest > seen.current)
    ) {
      notificationSound.alert();
    }
    if (seen.current === undefined || (latest !== null && (seen.current ?? '') < latest)) {
      seen.current = latest;
    }
  }, [page, newest]);

  const unread = page?.unread;
  useEffect(() => {
    if (unread === undefined) return;
    const badging = navigator as unknown as Badging;
    const done = unread > 0 ? badging.setAppBadge?.(unread) : badging.clearAppBadge?.();
    done?.catch(() => undefined);
  }, [unread]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent<unknown>): void => {
      const data = event.data as { type?: unknown } | null;
      if (data?.type === PUSH_ARRIVED) {
        void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [queryClient]);

  return null;
}

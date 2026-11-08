import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMarkNotificationsRead } from '@/api/notifications';
import { dayKey, formatTime } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import type { NotificationView } from '@/types/notifications';

// What the bell's panel and its page share (Part 37's `p37-bell`): when a row came, and opening one.

/** When a row came: the time today, "Yesterday", or how many days ago (the prototype's `.tm`). */
export function useWhen(): (iso: string) => string {
  const { t, i18n } = useTranslation('shell');
  return (iso) => {
    const now = new Date();
    if (dayKey(iso) === dayKey(now.toISOString())) return formatTime(iso, i18n.language);
    const days = Math.max(
      1,
      Math.round(
        (Date.parse(dayKey(now.toISOString())) - Date.parse(dayKey(iso))) / (24 * 60 * 60 * 1000),
      ),
    );
    return days === 1 ? t('ntYesterday') : t('p37DaysAgo', { count: days });
  };
}

/** Opens a notification where it leads, within the shop, and marks it read. */
export function useOpenNotification(): (notification: NotificationView) => void {
  const router = useRouter();
  const { slug } = useShell();
  const mark = useMarkNotificationsRead();
  return (notification) => {
    if (!notification.read) mark.mutate([notification.id]);
    if (notification.link) router.history.push(`/${slug}${notification.link}`);
  };
}

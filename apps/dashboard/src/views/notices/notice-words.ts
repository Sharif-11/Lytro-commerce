import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NoticeCategory, NoticeSeverity } from '@lytronix/validators';
import { formatShortDay, formatTime } from '@/lib/dates';

// The words and clocks the board, a notice, the bands and the prompt share (TENANT-DASHBOARD-DESIGN §7.40, Part 37).

/** Each category's word, in the shell's dictionary (shared by the board, the prompt and the bell). */
export const CATEGORY_WORD: Readonly<Record<NoticeCategory, string>> = {
  [NoticeCategory.RateChange]: 'p37CatRate',
  [NoticeCategory.Maintenance]: 'p37CatMaint',
  [NoticeCategory.NewFeature]: 'p37CatFeature',
  [NoticeCategory.Policy]: 'p37CatPolicy',
  [NoticeCategory.Security]: 'p37CatSecurity',
  [NoticeCategory.General]: 'p37CatGeneral',
};

/** "1 day 4 hours", "3 hours 12 minutes", "8 minutes": how long until a moment, in its two largest parts. */
export function useUntil(): (iso: string, now: number) => string {
  const { t } = useTranslation('shell');
  return (iso, now) => {
    const minutes = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    if (days > 0)
      return hours > 0
        ? `${t('p37DurDays', { count: days })} ${t('p37DurHours', { count: hours })}`
        : t('p37DurDays', { count: days });
    if (hours > 0)
      return mins > 0
        ? `${t('p37DurHours', { count: hours })} ${t('p37DurMins', { count: mins })}`
        : t('p37DurHours', { count: hours });
    return t('p37DurMins', { count: mins });
  };
}

/** The clock ticking once a minute, for a countdown. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return now;
}

/** A maintenance window as a sentence writes it: "9 Nov, 2:00 am–3:00 am". */
export function useWindowWords(): (window: { startsAt: string; endsAt: string }) => string {
  const { t, i18n } = useTranslation('shell');
  return (window) =>
    t('p37Window', {
      d: formatShortDay(window.startsAt, i18n.language),
      a: formatTime(window.startsAt, i18n.language),
      b: formatTime(window.endsAt, i18n.language),
    });
}

/** Whether a notice is important or urgent, as a tag shows it. */
export function severityTone(severity: NoticeSeverity): 'bad' | 'warn' | null {
  return severity === NoticeSeverity.Urgent
    ? 'bad'
    : severity === NoticeSeverity.Important
      ? 'warn'
      : null;
}

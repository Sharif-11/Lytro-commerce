import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MINUTES = 60;
// Under two days reads better in hours ("47 h").
const HOURS_BEFORE_DAYS = 48;

/** Money as the console writes it, in both languages: ৳1,250 or ৳448.50. */
export function taka(value: string | number): string {
  return `৳${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** A date as the console writes it, in Dhaka: 21 Oct 2026. */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(iso));
}

/** How many days ahead a date is, negative once it has passed. */
export function daysFromNow(iso: string, now = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / DAY_MS);
}

/** Today in Dhaka as the server writes a day: 2026-10-21. */
export function dhakaDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(date);
}

/** How long ago something was: 12 min, 3 h, 2 d. */
export function useAgo(): (iso: string) => string {
  const { t } = useTranslation();
  return useCallback(
    (iso: string) => {
      const minutes = Math.max(Math.round((Date.now() - new Date(iso).getTime()) / 60_000), 0);
      if (minutes < HOUR_MINUTES) return t('time.minutes', { n: minutes });
      const hours = Math.round(minutes / HOUR_MINUTES);
      if (hours < HOURS_BEFORE_DAYS) return t('time.hours', { n: hours });
      return t('time.days', { n: Math.round(hours / 24) });
    },
    [t],
  );
}

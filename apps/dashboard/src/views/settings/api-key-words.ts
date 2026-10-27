import { formatDayMonth, formatDayMonthYear } from '@/lib/dates';
import type { ApiKey } from '@/types/api-key';

type T = (key: string, options?: Record<string, unknown>) => string;

const HOUR_MS = 60 * 60 * 1000;

/** When a key was last used, as the list says it: just now, hours ago within a day, else the day. */
export function lastUsedOf(iso: string | null, t: T, now = Date.now()): string {
  if (iso === null) return t('akNever');
  const hours = Math.floor((now - Date.parse(iso)) / HOUR_MS);
  const when =
    hours < 1 ? t('akJustNow') : hours < 24 ? t('akHours', { count: hours }) : formatDayMonth(iso);
  return t('akLastUsed', { when });
}

/** A key's line in the list (the prototype's `api-keys`): its first characters, websites, last use and expiry. */
export function keyLine(key: ApiKey, t: T, now = Date.now()): string {
  return [
    `${key.prefix}…`,
    key.websites.join(', '),
    lastUsedOf(key.lastUsedAt, t, now),
    key.expiresAt ? t('akExpires', { date: formatDayMonthYear(key.expiresAt) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The website addresses typed one a line (API-08), blank lines left out; the server checks each. */
export function websitesOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** The day picked for a key to stop working, as the end of that day in Dhaka; none when left empty. */
export function expiryOf(day: string): string | undefined {
  return day === '' ? undefined : `${day}T23:59:59+06:00`;
}

/** The first refusal the server gave for the website addresses, whichever line it was about. */
export function websitesProblem(problems: Record<string, string>): string | undefined {
  const key = Object.keys(problems).find(
    (each) => each === 'websites' || each.startsWith('websites.'),
  );
  return key === undefined ? undefined : problems[key];
}

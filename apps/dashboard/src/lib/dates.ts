// The dashboard's own date helpers: times within a day and grouping by day. Whole dates and date-times are
// formatDate and formatDateTime in @lytronix/ui, shared with the console.
const DHAKA = 'Asia/Dhaka';

/** `22:03` in Dhaka, in either language: the clock of a stamp written beside its date (an export's request). */
export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: DHAKA,
  }).format(new Date(iso));
}

/** `11:42 am` in English; in Bangla, Western digits with the period word (BRAND-IDENTITY §5: সকাল, দুপুর,
    বিকাল, রাত), for rows already grouped under their day. */
export function formatTime(iso: string, language: string): string {
  if (language !== 'bn') {
    return new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: DHAKA,
    }).format(new Date(iso));
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone: DHAKA,
  }).formatToParts(new Date(iso));
  const hour24 = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  const period =
    hour24 < 5
      ? 'রাত'
      : hour24 < 12
        ? 'সকাল'
        : hour24 < 16
          ? 'দুপুর'
          : hour24 < 19
            ? 'বিকাল'
            : 'রাত';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${period} ${String(hour12)}:${minute}`;
}

/** `2026-10-19` in Dhaka: the key rows are grouped under. */
export function dayKey(iso: string, now?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DHAKA }).format(
    new Date(now === undefined ? iso : now),
  );
}

export type DayLabel = { kind: 'today' } | { kind: 'yesterday' } | { kind: 'date'; iso: string };

/** Today, yesterday, or the date: what a day group's heading says. */
export function dayLabel(iso: string, now = new Date().toISOString()): DayLabel {
  const key = dayKey(iso);
  if (key === dayKey(now)) return { kind: 'today' };
  const yesterday = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (key === dayKey(yesterday)) return { kind: 'yesterday' };
  return { kind: 'date', iso };
}

export interface DayGroup<T> {
  key: string;
  iso: string;
  items: T[];
}

/** Groups rows, already newest-first, under their Dhaka day. */
export function groupByDay<T>(items: T[], isoOf: (item: T) => string): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const iso = isoOf(item);
    const key = dayKey(iso);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, iso, items: [item] });
  }
  return groups;
}

/** Today's date as `YYYY-MM-DD` for a date input's default. */
export function todayInputValue(): string {
  return dayKey(new Date().toISOString());
}

/** A date's day, three-letter month and year in Dhaka. The month is en-US's: en-GB writes September "Sept". */
function dayMonthYear(iso: string): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: DHAKA,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((each) => each.type === type)?.value ?? '';
  return { day: part('day'), month: part('month'), year: part('year') };
}

/** A day as the prototype writes it beside a figure, in either language: "9 Nov" (Dhaka's calendar). */
export function formatDayMonth(iso: string): string {
  const { day, month } = dayMonthYear(iso);
  return `${day} ${month}`;
}

/** A day with its year, as the prototype's toasts write it in either language: "9 Dec 2026" (Dhaka's calendar). */
export function formatDayMonthYear(iso: string): string {
  const { day, month, year } = dayMonthYear(iso);
  return `${day} ${month} ${year}`;
}

/**
 * A date in a sentence: "7 Dec 2026", or in Bangla the month's own name with Western digits, "7 ডিসেম্বর 2026"
 * (BRAND-IDENTITY §5).
 */
export function formatLongDate(iso: string, language: string): string {
  if (language !== 'bn') return formatDayMonthYear(iso);
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    year: 'numeric',
    timeZone: DHAKA,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((each) => each.type === type)?.value ?? '';
  const month = new Intl.DateTimeFormat('bn-BD', { month: 'long', timeZone: DHAKA }).format(date);
  return `${part('day')} ${month} ${part('year')}`;
}

/** A month's own name in the visitor's language: "October", "অক্টোবর" (Dhaka's calendar). */
export function formatMonth(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    month: 'long',
    timeZone: DHAKA,
  }).format(new Date(iso));
}

/** A month with its year, for a list grouped by month: "October 2026", "অক্টোবর 2026" (Western digits). */
export function formatMonthYear(iso: string, language: string): string {
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: DHAKA }).format(
    new Date(iso),
  );
  return `${formatMonth(iso, language)} ${year}`;
}

/** The month an ISO moment falls in, in Dhaka: the key a list is grouped by. */
export function monthKey(iso: string): string {
  return dayKey(iso).slice(0, 7);
}

/** LIF-05: whole days since a moment that has passed ("the plan ended 2 days ago"); 0 on the day itself. */
export function daysSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

/** STO-09: a video's length as its card writes it, minutes and seconds ("0:42", "12:05"). */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

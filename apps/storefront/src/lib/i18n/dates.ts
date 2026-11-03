// How the prototype writes a date, the same in both languages and on Dhaka's clock: `31 Oct 2026`, `31 Oct, 11:42`. Built
// from parts because a locale's own order and month names differ (en-GB's September is `Sept`).
const PARTS = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Dhaka',
});

function partsOf(when: string): Record<string, string> {
  return Object.fromEntries(
    PARTS.formatToParts(new Date(when)).map((part) => [part.type, part.value]),
  );
}

/** `31 Oct 2026` */
export function dayMonthYear(when: string): string {
  const parts = partsOf(when);
  return `${parts['day'] ?? ''} ${parts['month'] ?? ''} ${parts['year'] ?? ''}`;
}

/** `31 Oct, 11:42` */
export function dayMonthTime(when: string): string {
  const parts = partsOf(when);
  return `${parts['day'] ?? ''} ${parts['month'] ?? ''}, ${parts['hour'] ?? ''}:${parts['minute'] ?? ''}`;
}

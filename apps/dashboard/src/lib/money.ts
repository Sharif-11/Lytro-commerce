/** `৳4,741`: whole taka, sign first, three-digit grouping, Western digits (BRAND-IDENTITY §5). */
export function formatTaka(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '৳0';
  return `৳${Math.round(value).toLocaleString('en-US')}`;
}

/** Whole days from now until an ISO date, never negative; null without a date. */
export function daysUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

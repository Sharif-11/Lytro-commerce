/** `৳4,741`: whole taka, sign first, three-digit grouping, Western digits (BRAND-IDENTITY §5). */
export function formatTaka(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '৳0';
  return `৳${Math.round(value).toLocaleString('en-US')}`;
}

/** `৳-0.50`: the same, but paisa kept when the amount has any -- ledger lines and rates charge fractions. */
export function formatTakaExact(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '৳0';
  const fraction = Math.abs(value) % 1 === 0 ? 0 : 2;
  return `৳${value.toLocaleString('en-US', { minimumFractionDigits: fraction, maximumFractionDigits: 2 })}`;
}

/** A platform rate as a seller reads it: at most two decimals, no trailing zeros (RAT-08 stores four). */
export function formatRate(value: string | number | null): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (numeric === null || !Number.isFinite(numeric)) return '–';
  return numeric.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Whole days from now until an ISO date, never negative; null without a date. */
export function daysUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

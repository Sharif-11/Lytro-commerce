import type { PlanLimits } from '@lytronix/validators';

/** A limit's key as the plan figures name it (`staff` is seats, counting the owner). */
export type LimitKey = keyof PlanLimits;

const MB_PER_GB = 1024;

/**
 * A limit's figure as the plan cards write it: "1,000", "2 GB" or "250 MB" for storage, "10 GB" for bandwidth, and "∞"
 * when it has none. Null when the plan does not set it.
 */
export function limitFigure(key: LimitKey, value: number | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return '∞';
  if (key === 'storage_mb') return megabytes(value);
  if (key === 'bandwidth_gb') return `${value.toLocaleString('en-US')} GB`;
  return value.toLocaleString('en-US');
}

/** Storage in the unit a seller reads: whole gigabytes from 1 GB up, else megabytes. */
export function megabytes(value: number): string {
  if (value < MB_PER_GB) return `${Math.round(value).toLocaleString('en-US')} MB`;
  const gb = value / MB_PER_GB;
  return `${Number.isInteger(gb) ? gb.toLocaleString('en-US') : gb.toFixed(1)} GB`;
}

/** A file's size as the export row writes it: "18 MB". */
export function fileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${Math.round(mb).toLocaleString('en-US')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('en-US')} KB`;
}

/** An English list's first letter capitalised ("products 100 → 25 · seats 2 → 1"); Bangla has no case. */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

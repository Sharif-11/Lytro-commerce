/** NTC-11: notices are timed in Dhaka, a fixed UTC+6 (TRM-09). */
const DHAKA_OFFSET = '+06:00';
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** An instant as a `datetime-local` field holds it, on the Dhaka clock: 2026-11-10T02:00. */
export function toDhakaInput(iso: string): string {
  return new Date(new Date(iso).getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 16);
}

/** What a `datetime-local` field holds, read as Dhaka time, as the instant the server takes; null when empty or bad. */
export function fromDhakaInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const at = new Date(`${value}:00${DHAKA_OFFSET}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The next whole hour from now, for a time the operator hasn't picked yet. */
export function nextHourInput(now = Date.now()): string {
  return toDhakaInput(new Date(Math.ceil((now + 1) / HOUR_MS) * HOUR_MS).toISOString());
}

import { CourierKey } from '@lytronix/validators';
import { formatDayMonth, formatMonth } from './dates';

// The couriers by name (TENANT-DASHBOARD-DESIGN §7.39): every courier is shown by its name as a seller knows it, never a logo.
// The server gives the same names; these are for the screens that hold only a courier's key (a list row, a payout).

export const COURIER_NAME: Readonly<Record<CourierKey, string>> = {
  [CourierKey.Steadfast]: 'Steadfast',
  [CourierKey.Pathao]: 'Pathao',
  [CourierKey.RedX]: 'RedX',
};

/** A courier's name from its key. */
export const courierName = (key: CourierKey): string => COURIER_NAME[key];

/** "6 Nov", "6 নভেম্বর": a day in a sentence, its month in the sentence's language (Dhaka's calendar). */
export function dayInSentence(iso: string, language: string): string {
  if (language !== 'bn') return formatDayMonth(iso);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'Asia/Dhaka' }).format(
    new Date(iso),
  );
  return `${day} ${formatMonth(iso, 'bn')}`;
}

import { randomInt } from 'node:crypto';

// ORD-05: no 0, O, 1 or I, so a tracking ID read out over the phone is never mistaken.
export const TRACKING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const TRACKING_LENGTH = 8;

/** ORD-04 (D4-4): `YYMMDD-NNNN` for the `sequence`-th order of a day in Asia/Dhaka (YYYY-MM-DD); five digits past 9999. */
export function orderNumberOf(day: string, sequence: number): string {
  return `${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}-${String(sequence).padStart(4, '0')}`;
}

/** ORD-05: a new tracking ID, eight characters drawn at random from the unambiguous alphabet. */
export function newTrackingId(): string {
  let id = '';
  for (let index = 0; index < TRACKING_LENGTH; index += 1) {
    id += TRACKING_ALPHABET.charAt(randomInt(TRACKING_ALPHABET.length));
  }
  return id;
}

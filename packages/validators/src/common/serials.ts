import { SERIAL_MAX_LENGTH } from './limits';
import { SerialFormat } from '../db/enums';

/** INV-23: why one entered serial cannot be saved as it is. */
export type SerialProblem =
  'empty' | 'too_long' | 'not_imei' | 'bad_check_digit' | 'bad_characters';

// An "any" serial: letters, digits and dashes (an IMEI's digits are a subset).
const ANY_SERIAL = /^[A-Z0-9-]+$/;

/**
 * INV-23: whether 15 digits make a valid IMEI. Its last digit is the Luhn check digit of the first fourteen: every
 * second digit from the right is doubled (with its own digits summed), and the whole sum is a multiple of 10.
 */
export function isValidImei(digits: string): boolean {
  if (!/^\d{15}$/.test(digits)) return false;
  let sum = 0;
  for (let index = 0; index < 15; index += 1) {
    let digit = Number(digits[14 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * INV-14, INV-23: a serial as it is stored and compared. An IMEI keeps only its digits ("35 209900 176148 1" is the
 * same phone as "352099001761481"); any other serial is trimmed and upper-cased, so "abc-1" and "ABC-1" are one unit.
 */
export function normalizeSerial(raw: string, format: SerialFormat): string {
  return format === SerialFormat.Imei
    ? raw.replace(/[\s-]/g, '')
    : raw.trim().replace(/\s+/g, '').toUpperCase();
}

/** INV-23: what is wrong with one entered serial for a product of this format, after normalising it; null if nothing. */
export function serialProblem(raw: string, format: SerialFormat): SerialProblem | null {
  const serial = normalizeSerial(raw, format);
  if (serial.length === 0) return 'empty';
  if (format === SerialFormat.Imei) {
    if (!/^\d{15}$/.test(serial)) return 'not_imei';
    return isValidImei(serial) ? null : 'bad_check_digit';
  }
  if (serial.length > SERIAL_MAX_LENGTH) return 'too_long';
  return ANY_SERIAL.test(serial) ? null : 'bad_characters';
}

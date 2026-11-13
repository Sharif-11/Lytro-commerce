// D9-7, LEG-03 (Phase 9 Slice 9.8): what Lytro's VAT registration may hold, as the operator sets it in the platform
// settings. Each is a string, empty until set or after it is cleared; Lytro's invoices carry VAT only once all four are set.

/** A Business Identification Number: 9 digits, or 13 with the branch's 4, written together or as 123456789-0101. */
const VAT_BIN_PATTERN = /^(?:\d{9}|\d{13}|\d{9}-\d{4})$/;
/** A rate in per cent with at most two decimals, such as 15, 7.5 or 7.50. */
const VAT_RATE_PATTERN = /^\d{1,3}(?:\.\d{1,2})?$/;
// SEC-13: no control characters in what an invoice prints, line breaks included.
// eslint-disable-next-line no-control-regex -- the control characters are what it looks for
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** The longest registered name and address an invoice prints (Mushak-6.3's seller lines). */
export const VAT_SELLER_NAME_MAX = 120;
export const VAT_SELLER_ADDRESS_MAX = 300;

export function isVatBin(value: unknown): value is string {
  return typeof value === 'string' && VAT_BIN_PATTERN.test(value);
}

/** Above 0 and at most 100 per cent, at most two decimals. */
export function isVatRate(value: unknown): value is string {
  if (typeof value !== 'string' || !VAT_RATE_PATTERN.test(value)) return false;
  const [whole = '0', fraction = ''] = value.split('.');
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return hundredths > 0 && hundredths <= 10_000;
}

/** A line of printed text, not blank, at most `max` characters, with no control characters. */
export function isPrintedLine(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    value !== '' &&
    value.length <= max &&
    !CONTROL_CHARACTERS.test(value)
  );
}

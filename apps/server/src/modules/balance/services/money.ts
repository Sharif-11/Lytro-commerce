// DAT-05: money is never floating point. Amounts are stored and exchanged as decimal strings; arithmetic here
// runs on integer paisa (1/100 TK) so repeated additions never drift the way repeated float addition would.

/** Parses a decimal-taka string into integer paisa. Throws on anything that isn't a plain decimal number. */
export function toPaisa(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`not a decimal amount: ${value}`);
  const sign = match[1] ?? '';
  const whole = match[2];
  if (whole === undefined) throw new Error(`not a decimal amount: ${value}`);
  const paddedFraction = (match[3] ?? '').padEnd(2, '0');
  const magnitude = BigInt(whole) * 100n + BigInt(paddedFraction);
  return sign === '-' ? -magnitude : magnitude;
}

/** Formats integer paisa back into a decimal-taka string with exactly two decimals. */
export function fromPaisa(paisa: bigint): string {
  const sign = paisa < 0n ? '-' : '';
  const magnitude = paisa < 0n ? -paisa : paisa;
  const whole = magnitude / 100n;
  const fraction = magnitude % 100n;
  return `${sign}${whole.toString()}.${fraction.toString().padStart(2, '0')}`;
}

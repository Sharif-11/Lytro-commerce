// DAT-05: money is never floating point. Amounts are stored and exchanged as decimal strings; arithmetic here
// runs on integer paisa (1/100 TK) so repeated additions never drift the way repeated float addition would.

// A rate (control.rates.value, balance_ledger.rate_used) is numeric(12,4): up to four decimals, a hundredth of a
// paisa. Money itself has two.
const RATE_DECIMALS = 4;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);

/** Parses a plain decimal string with at most `decimals` places into an integer count of 10^-decimals. */
function toScaled(value: string, decimals: number): bigint {
  const match = new RegExp(`^(-?)(\\d+)(?:\\.(\\d{1,${String(decimals)}}))?$`).exec(value.trim());
  const whole = match?.[2];
  if (!match || whole === undefined) throw new Error(`not a decimal amount: ${value}`);
  const fraction = (match[3] ?? '').padEnd(decimals, '0');
  const magnitude = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction);
  return match[1] === '-' ? -magnitude : magnitude;
}

/** Parses a decimal-taka string into integer paisa. Throws on anything that isn't a plain decimal number. */
export function toPaisa(value: string): bigint {
  return toScaled(value, 2);
}

/** Formats integer paisa back into a decimal-taka string with exactly two decimals. */
export function fromPaisa(paisa: bigint): string {
  const sign = paisa < 0n ? '-' : '';
  const magnitude = paisa < 0n ? -paisa : paisa;
  const whole = magnitude / 100n;
  const fraction = magnitude % 100n;
  return `${sign}${whole.toString()}.${fraction.toString().padStart(2, '0')}`;
}

/** Integer division rounded half away from zero, so 0.825 TK becomes 0.83 TK (BAL-16). `divisor` is positive. */
export function divideRounded(dividend: bigint, divisor: bigint): bigint {
  const magnitude = dividend < 0n ? -dividend : dividend;
  const rounded = (magnitude * 2n + divisor) / (2n * divisor);
  return dividend < 0n ? -rounded : rounded;
}

/** BAL-16: units (two decimals) times a rate (up to four), in paisa, rounded to the paisa. */
export function unitsTimesRate(units: string, rate: string): bigint {
  return divideRounded(toScaled(units, 2) * toScaled(rate, RATE_DECIMALS), RATE_SCALE);
}

/** A flat rate (up to four decimals) as paisa, rounded to the paisa. */
export function rateToPaisa(rate: string): bigint {
  return divideRounded(toScaled(rate, RATE_DECIMALS), RATE_SCALE / 100n);
}

/** `percent` per cent (a rate, up to four decimals) of an amount in paisa, rounded to the paisa. */
export function percentOf(paisa: bigint, percent: string): bigint {
  return divideRounded(paisa * toScaled(percent, RATE_DECIMALS), 100n * RATE_SCALE);
}

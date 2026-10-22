// DAT-05: money is never floating point. Amounts are stored and exchanged as decimal strings; arithmetic here
// runs on integer paisa (1/100 TK) so repeated additions never drift the way repeated float addition would.

// A rate (control.rates.value, balance_ledger.rate_used) and a unit cost (avg_cost, unit_cost) are numeric(12,4): up
// to four decimals, a hundredth of a paisa. Money itself has two, and a stock quantity three (UOM-03).
const FINE_DECIMALS = 4;
const FINE_SCALE = 10n ** BigInt(FINE_DECIMALS);
const QUANTITY_DECIMALS = 3;

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
  return divideRounded(toScaled(units, 2) * toScaled(rate, FINE_DECIMALS), FINE_SCALE);
}

/** A flat rate (up to four decimals) as paisa, rounded to the paisa. */
export function rateToPaisa(rate: string): bigint {
  return divideRounded(toScaled(rate, FINE_DECIMALS), FINE_SCALE / 100n);
}

/** `percent` per cent (a rate, up to four decimals) of an amount in paisa, rounded to the paisa. */
export function percentOf(paisa: bigint, percent: string): bigint {
  return divideRounded(paisa * toScaled(percent, FINE_DECIMALS), 100n * FINE_SCALE);
}

/** INV-07, INV-18: a stock quantity (up to three decimals, signed) at a unit cost (up to four), in paisa, rounded. */
export function quantityTimesCost(quantity: string, unitCost: string): bigint {
  return divideRounded(
    toScaled(quantity, QUANTITY_DECIMALS) * toScaled(unitCost, FINE_DECIMALS),
    10n ** BigInt(QUANTITY_DECIMALS + FINE_DECIMALS - 2),
  );
}

/** A count of 10^-4 taka as a decimal string with four places, as a unit cost is stored. */
function fromFine(fine: bigint): string {
  const sign = fine < 0n ? '-' : '';
  const magnitude = fine < 0n ? -fine : fine;
  const fraction = (magnitude % FINE_SCALE).toString().padStart(FINE_DECIMALS, '0');
  return `${sign}${(magnitude / FINE_SCALE).toString()}.${fraction}`;
}

/** UOM-03: stock quantities added exactly, as a quantity is stored: three decimal places. */
export function sumQuantities(quantities: readonly string[]): string {
  const scale = 10n ** BigInt(QUANTITY_DECIMALS);
  const total = quantities.reduce(
    (sum, quantity) => sum + toScaled(quantity, QUANTITY_DECIMALS),
    0n,
  );
  const sign = total < 0n ? '-' : '';
  const magnitude = total < 0n ? -total : total;
  const fraction = (magnitude % scale).toString().padStart(QUANTITY_DECIMALS, '0');
  return `${sign}${(magnitude / scale).toString()}.${fraction}`;
}

/** INV-24: the cost of one pack of `packAmount` at a unit cost, to four decimals like the cost itself, rounded. */
export function packCost(packAmount: string, unitCost: string): string {
  return fromFine(
    divideRounded(
      toScaled(packAmount, QUANTITY_DECIMALS) * toScaled(unitCost, FINE_DECIMALS),
      10n ** BigInt(QUANTITY_DECIMALS),
    ),
  );
}

/**
 * INV-24, PUR-07: what one unit of a shared stock cost, from what one pack of `packAmount` (more than zero) cost: the
 * pack's cost divided by its amount, to four decimals, rounded half up. A 100 ml pack at 500.00 is 5.0000 a ml.
 */
export function unitCostOfPack(packPrice: string, packAmount: string): string {
  return fromFine(
    divideRounded(
      toScaled(packPrice, FINE_DECIMALS) * 10n ** BigInt(QUANTITY_DECIMALS),
      toScaled(packAmount, QUANTITY_DECIMALS),
    ),
  );
}

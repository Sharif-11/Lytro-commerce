import { StockState } from '@lytronix/validators';

/** Thousandths, so stock arithmetic on three-decimal quantities is exact. */
export function milli(quantity: string | number): number {
  return Math.round(Number(quantity) * 1000);
}

/** A quantity in thousandths back to the three-decimal form the database stores. */
export function quantityOf(thousandths: number): string {
  return (thousandths / 1000).toFixed(3);
}

/** CCH-08, INV-08: a variant is out with nothing available, low at or under its product's threshold, else in. */
export function variantState(available: string, threshold: string): StockState {
  if (milli(available) <= 0) return StockState.Out;
  if (milli(available) <= milli(threshold)) return StockState.Low;
  return StockState.In;
}

/** CCH-08: a product shows its best variant's state, so one size in stock keeps it buyable. */
export function productState(states: StockState[]): StockState {
  if (states.includes(StockState.In)) return StockState.In;
  if (states.includes(StockState.Low)) return StockState.Low;
  return StockState.Out;
}

/** INV-24: how many whole packs of `packAmount` a shared stock's available quantity makes, rounded down. */
export function packsOf(available: string, packAmount: string): number {
  const pack = milli(packAmount);
  return pack > 0 ? Math.floor(Math.max(milli(available), 0) / pack) : 0;
}

/**
 * INV-24, CCH-08, INV-08: a variant drawing on a shared stock is out when not one of its packs is left, low when the
 * shared stock is at or under the product's threshold, else in.
 */
export function sharedVariantState(
  poolAvailable: string,
  packAmount: string,
  threshold: string,
): StockState {
  if (packsOf(poolAvailable, packAmount) === 0) return StockState.Out;
  if (milli(poolAvailable) <= milli(threshold)) return StockState.Low;
  return StockState.In;
}

/**
 * INV-13, INV-15: of the units held for orders, how many expiry left with nothing sellable under them -- what is held
 * beyond the stock on hand that has not expired. Zero when what is held is covered.
 */
export function reservedExpired(level: {
  onHand: string;
  reserved: string;
  unsellable: string;
}): string {
  return quantityOf(
    Math.max(milli(level.reserved) + milli(level.unsellable) - milli(level.onHand), 0),
  );
}

/** INV-24: a whole number of packs of `packAmount`, in the shared stock's unit. Exact, since `packs` is whole. */
export function packsToStock(packs: string, packAmount: string): string {
  return quantityOf((milli(packs) / 1000) * milli(packAmount));
}

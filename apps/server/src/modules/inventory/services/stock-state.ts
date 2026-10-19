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

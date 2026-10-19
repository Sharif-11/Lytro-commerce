// The database refused a stock change (INV-01, UOM-03): it would leave less on hand, or available, than zero
// ('shortfall'), or a fraction of a product counted in whole units ('whole_units'). Adapters report it by kind, so
// services can answer clearly without knowing constraint names.
export class StockRefused extends Error {
  constructor(readonly kind: 'shortfall' | 'whole_units') {
    super(`stock refused: ${kind}`);
    this.name = 'StockRefused';
  }
}

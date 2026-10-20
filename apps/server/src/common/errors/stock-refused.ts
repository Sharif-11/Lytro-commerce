// The database refused a stock change (INV-01, UOM-03, INV-24): it would leave less on hand, or available, than zero
// ('shortfall'), a fraction of a product counted in whole units ('whole_units'), or a product switching to or from
// shared stock while it holds some ('not_empty'). Adapters report it by kind, so services can answer clearly without
// knowing constraint names.
export class StockRefused extends Error {
  constructor(readonly kind: 'shortfall' | 'whole_units' | 'not_empty') {
    super(`stock refused: ${kind}`);
    this.name = 'StockRefused';
  }
}

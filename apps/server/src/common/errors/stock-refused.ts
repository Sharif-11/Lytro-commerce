// The database refused a stock change (INV-01, UOM-03, INV-24, INV-13): it would leave less on hand, or available, than
// zero ('shortfall'), a fraction of a product counted in whole units ('whole_units'), a product switching to or from
// shared stock while it holds some ('not_empty'), or batch tracking turned off while expired stock still waits to be
// written off ('expired_waiting'). Adapters report it by kind, so services can answer clearly without knowing
// constraint names.
export class StockRefused extends Error {
  constructor(readonly kind: 'shortfall' | 'whole_units' | 'not_empty' | 'expired_waiting') {
    super(`stock refused: ${kind}`);
    this.name = 'StockRefused';
  }
}

// The database refused a stock change (INV-01, UOM-03, INV-24, INV-13, INV-15): it would take more than is free to sell
// ('shortfall'), leave less on hand than is held for orders, or let go of a variant or product an order holds
// ('held'), leave a fraction of a product counted in whole units ('whole_units'), a product switching to or from
// shared stock while it holds some ('not_empty'), batch tracking turned off while expired stock still waits to be
// written off ('expired_waiting'), serial tracking turned off while a unit holds a serial ('serials_held'), or a
// size drawing on a shared stock bought by itself rather than by the shared stock ('shared').
// Adapters report it by kind, so services can answer clearly without knowing constraint names.
export class StockRefused extends Error {
  constructor(
    readonly kind:
      | 'shortfall'
      | 'held'
      | 'whole_units'
      | 'not_empty'
      | 'expired_waiting'
      | 'serials_held'
      | 'shared',
  ) {
    super(`stock refused: ${kind}`);
    this.name = 'StockRefused';
  }
}

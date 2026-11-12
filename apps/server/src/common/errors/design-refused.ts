// ATR-19 (PD-13): a photo or a variant named a design that is not one of its own product's live designs (the
// database's `catalogue_design_photo` and `catalogue_design_variant`). Adapters report it, so the service can name the
// field that was wrong.
export class DesignNotOfProduct extends Error {
  constructor() {
    super('design not of this product');
    this.name = 'DesignNotOfProduct';
  }
}

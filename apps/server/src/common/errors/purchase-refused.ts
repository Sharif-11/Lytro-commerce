// The database refused a delivery (PUR-04): it would bring an item more than is still to come on it ('outstanding'),
// or it was taken against a purchase that is not placed and open ('not_open'). Adapters report it by kind, so services
// can answer clearly without knowing constraint names.
export class PurchaseRefused extends Error {
  constructor(readonly kind: 'outstanding' | 'not_open') {
    super(`purchase refused: ${kind}`);
    this.name = 'PurchaseRefused';
  }
}

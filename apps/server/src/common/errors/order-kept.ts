// The database refused to delete an order (ORD-12): it has shipped or a payment on it is verified, so it is cancelled or
// returned instead. Adapters report it, so services can answer clearly without knowing constraint names.
export class OrderKept extends Error {
  constructor() {
    super('order kept');
    this.name = 'OrderKept';
  }
}

// A unique constraint refused a write. Adapters report it by target, so services can answer clearly
// (for example "that address is taken") without knowing constraint names.
export class UniqueViolation extends Error {
  constructor(
    readonly target:
      | 'phone'
      | 'email'
      | 'address'
      | 'role'
      | 'rank'
      | 'transactionId'
      | 'slug'
      | 'sku'
      | 'combination'
      | 'name'
      | 'value'
      | 'area',
  ) {
    super(`unique violation: ${target}`);
    this.name = 'UniqueViolation';
  }
}

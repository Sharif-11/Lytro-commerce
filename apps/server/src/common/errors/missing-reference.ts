// A foreign key refused a write: it named a row that is not there (or, under row-level security, is another shop's).
// Adapters report it by target, so services can answer "not found" without knowing constraint names.
export class MissingReference extends Error {
  constructor(readonly target: 'zone' | 'variant' | 'supplier') {
    super(`missing reference: ${target}`);
    this.name = 'MissingReference';
  }
}

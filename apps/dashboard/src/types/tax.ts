/** A tax class (TAX-01): how much of a price is tax. The rate is a decimal string, like "5.00". */
export interface TaxClass {
  id: string;
  name: string;
  rate: string;
}

/** GET /tax-classes: the shop's classes, and the one new products start with; null for no tax. */
export interface TaxClasses {
  classes: TaxClass[];
  defaultId: string | null;
}

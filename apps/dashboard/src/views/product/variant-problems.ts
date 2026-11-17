/**
 * What a variant sets in its own sheet (11.13b, design v3.15); a field of these the server refuses marks the variant's
 * name in the table and is said under the field in the sheet. Since the fixes PR (2026-11-14) its SKU is typed in the
 * table too -- a new product's, and a saved one's beside its quick Add stock -- and a refused SKU is said under that box.
 */
const SHEET_FIELDS = ['sku', 'barcode', 'weightKg', 'deliveryCharge'] as const;
export type SheetField = (typeof SHEET_FIELDS)[number];

/** The server's problems with one variant's sheet fields, by field. */
export function sheetProblems(
  problems: Readonly<Record<string, string>>,
  index: number,
): Partial<Record<SheetField, string>> {
  const found: Partial<Record<SheetField, string>> = {};
  for (const field of SHEET_FIELDS) {
    const message = problems[`variants.${String(index)}.${field}`];
    if (message !== undefined) found[field] = message;
  }
  return found;
}

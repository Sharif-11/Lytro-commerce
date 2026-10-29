/**
 * What a variant sets in its own sheet (11.13b, design v3.15: its SKU is set there only, never in the table); a field
 * of these the server refuses marks the variant's name in the table and is said under the field in the sheet.
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

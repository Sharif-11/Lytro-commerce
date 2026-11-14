export type CsvValue = string | number | null | undefined;

/**
 * Who opens the file. A spreadsheet runs a cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return as a formula,
 * so there such text -- a seller-typed shop name, say -- is kept as text by a leading apostrophe (CSV injection; the Phase 8
 * close-out's review C, F6). A feed a machine reads, such as Meta's catalog, can't take an apostrophe, which would show
 * on Facebook (Slice 9.7): a cell there that would run starts with a space instead, which the feed's reader trims and a
 * spreadsheet keeps as text. A bullet ("- 100% cotton") and a plain number stay exactly as written in both.
 */
export type CsvReader = 'spreadsheet' | 'machine';

const FORMULA_START = /^[=+\-@\t\r]/;
// A plain number, such as -5.50 or -300.00, is never touched: it is a figure, not a formula.
const PLAIN_NUMBER = /^[-+]?\d+(\.\d+)?$/;
// A dash and a space start a bullet, which no spreadsheet runs.
const BULLET = /^- /;

function csvEscape(value: CsvValue, reader: CsvReader): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) {
    if (reader === 'spreadsheet') text = `'${text}`;
    else if (!BULLET.test(text)) text = ` ${text}`;
  }
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(
  rows: Record<string, CsvValue>[],
  columns: string[],
  reader: CsvReader = 'spreadsheet',
): string {
  const header = columns.join(',');
  const lines = rows.map((row) =>
    columns.map((column) => csvEscape(row[column], reader)).join(','),
  );
  return [header, ...lines].join('\n');
}

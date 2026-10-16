export type CsvValue = string | number | null | undefined;

function csvEscape(value: CsvValue): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Record<string, CsvValue>[], columns: string[]): string {
  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','));
  return [header, ...lines].join('\n');
}

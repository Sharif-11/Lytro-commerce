import { describe, expect, it } from 'vitest';
import { SerialFormat } from '@lytronix/validators';
import {
  addSerials,
  batchBody,
  keptOf,
  markTaken,
  NO_BATCH,
  openingExtras,
  splitList,
  unitsOf,
} from '../src/lib/opening';

const NONE = new Set<string>();

describe('opening serials, line by line (Part 16; INV-14, INV-23)', () => {
  it('splits a pasted list on lines, commas, semicolons and tabs; spaces inside stay', () => {
    expect(splitList('356789104567894\n35 678910 456790 9, 356789104567910;\tVF-1\n\n')).toEqual([
      '356789104567894',
      '35 678910 456790 9',
      '356789104567910',
      'VF-1',
    ]);
  });

  it('flags each line by its format, and a code twice in the list or the product', () => {
    const { lines } = addSerials(
      [],
      [
        '356789104567894',
        '35678910456',
        '356789104567895',
        '35 678910 456789 4',
        '356789104567902',
      ],
      SerialFormat.Imei,
      5,
      new Set(['356789104567902']),
    );
    expect(lines).toEqual([
      { code: '356789104567894', flag: null },
      { code: '35678910456', flag: 'notImei' },
      { code: '356789104567895', flag: 'badImei' },
      { code: '356789104567894', flag: 'twice' },
      { code: '356789104567902', flag: 'twice' },
    ]);
    expect(keptOf(lines)).toEqual(['356789104567894']);
  });

  it("checks any other code's characters and length, upper-cased as stored", () => {
    const { lines } = addSerials(
      [],
      ['vf-2026-0001', 'VF#0003', 'X'.repeat(65)],
      SerialFormat.Any,
      5,
      NONE,
    );
    expect(lines.map((line) => [line.code.slice(0, 12), line.flag])).toEqual([
      ['VF-2026-0001', null],
      ['VF#0003', 'badChars'],
      ['XXXXXXXXXXXX', 'tooLong'],
    ]);
  });

  it('stops at the opening stock, giving back what did not fit; a flagged line takes no unit', () => {
    const { lines, rest } = addSerials([], ['A-1', 'B#2', 'C-3', 'D-4'], SerialFormat.Any, 2, NONE);
    expect(keptOf(lines)).toEqual(['A-1', 'C-3']);
    expect(lines).toHaveLength(3);
    expect(rest).toEqual(['D-4']);
  });

  it('flags the kept ones the shop holds already', () => {
    const lines = [
      { code: 'A-1', flag: null },
      { code: 'B-2', flag: null },
      { code: 'C#3', flag: 'badChars' as const },
    ];
    expect(markTaken(lines, ['B-2']).map((line) => line.flag)).toEqual([null, 'taken', 'badChars']);
  });

  it('counts whole units from what was typed', () => {
    expect(unitsOf('5')).toBe(5);
    expect(unitsOf(' 2.5 ')).toBe(2);
    expect(unitsOf('')).toBe(0);
    expect(unitsOf('five')).toBe(0);
  });
});

describe('what a new variant’s stock carries (INV-10, INV-12, INV-14)', () => {
  const batch = { code: ' LS-2607 ', expiresOn: '2027-08-31', unitCost: '410' };
  const serials = [
    { code: '356789104567894', flag: null },
    { code: '35678910456', flag: 'notImei' as const },
  ];

  it('a batch with its code, expiry and unit cost; only what was typed of it', () => {
    expect(openingExtras(24, batch, [], { batch: true, serial: false })).toEqual({
      openingBatch: { batchCode: 'LS-2607', expiresOn: '2027-08-31' },
      openingUnitCost: 410,
    });
    expect(batchBody(NO_BATCH)).toBeNull();
    expect(openingExtras(24, NO_BATCH, [], { batch: true, serial: false })).toEqual({});
  });

  it('the serials kept, never the flagged ones', () => {
    expect(openingExtras(5, NO_BATCH, serials, { batch: false, serial: true })).toEqual({
      openingSerials: ['356789104567894'],
    });
  });

  it('nothing without stock on the shelf, nor what the product does not count', () => {
    expect(openingExtras(undefined, batch, serials, { batch: true, serial: true })).toEqual({});
    expect(openingExtras(0, batch, serials, { batch: true, serial: true })).toEqual({});
    expect(openingExtras(5, batch, serials, { batch: false, serial: false })).toEqual({});
  });
});

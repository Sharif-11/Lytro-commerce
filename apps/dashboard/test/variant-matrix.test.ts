import { describe, expect, it } from 'vitest';
import { AttributeDataType, AttributeRole, UnitKind } from '@lytronix/validators';
import { baseValueOf, measureOf } from '../src/lib/measure';
import {
  blankRow,
  combinations,
  describedValue,
  descriptionsBody,
  fillAll,
  keyOf,
  overLimit,
  reconcile,
  roleRefusals,
  setsFor,
  splitsFull,
  variantCount,
  type Description,
  type SplitAttribute,
  type VariantRow,
} from '../src/lib/variant-matrix';

const split = (attributeId: string, values: string[]): SplitAttribute => ({
  attributeId,
  name: attributeId,
  dataType: AttributeDataType.EnumSingle,
  unitKind: null,
  options: values.map((value) => ({
    id: `${attributeId}-${value}`,
    value,
    swatchColor: null,
    swatchImage: null,
  })),
});
const SIZE = split('size', ['1lb', '2lb']);
const FLAVOUR = split('flavour', ['choc', 'van', 'red']);
const row = (optionIds: string[], patch: Partial<VariantRow> = {}): VariantRow => ({
  ...blankRow(optionIds),
  ...patch,
});

describe('the variant table (ATR-04, ATR-11, ATR-14, ATR-17)', () => {
  it('makes one variant per combination, the first attribute outermost, as the server plans them', () => {
    expect(combinations([SIZE, FLAVOUR])).toEqual([
      ['size-1lb', 'flavour-choc'],
      ['size-1lb', 'flavour-van'],
      ['size-1lb', 'flavour-red'],
      ['size-2lb', 'flavour-choc'],
      ['size-2lb', 'flavour-van'],
      ['size-2lb', 'flavour-red'],
    ]);
    expect(combinations([])).toEqual([]);
    expect(variantCount([SIZE, FLAVOUR])).toBe(6);
    // An attribute with no options yet makes nothing to sell.
    expect(combinations([SIZE, split('fit', [])])).toEqual([]);
  });

  it('knows a combination whatever order its options come in', () => {
    expect(keyOf(['b', 'a'])).toBe(keyOf(['a', 'b']));
  });

  it('stops at 100 variants and 3 splitting attributes (ATR-14)', () => {
    const many = split(
      'size',
      Array.from({ length: 12 }, (_, index) => String(index)),
    );
    const colours = split(
      'colour',
      Array.from({ length: 9 }, (_, index) => String(index)),
    );
    expect(overLimit([many, colours])).toBe(true);
    expect(combinations([many, colours])).toEqual([]);
    expect(overLimit([SIZE, FLAVOUR])).toBe(false);
    expect(splitsFull([SIZE, FLAVOUR])).toBe(false);
    expect(splitsFull([SIZE, FLAVOUR, split('fit', ['a'])])).toBe(true);
  });

  it('keeps what was typed when options change, and brings back a saved variant put back', () => {
    const typed = [
      row(['size-1lb', 'flavour-choc'], { price: '850' }),
      row(['size-2lb', 'flavour-choc'], { price: '1600' }),
    ];
    const saved = [row(['size-2lb', 'flavour-van'], { id: 'v-7', sku: 'CK-2V' })];
    const next = reconcile([SIZE, FLAVOUR], typed, saved);
    expect(next).toHaveLength(6);
    expect(next[0]).toEqual(typed[0]);
    expect(next[3]).toEqual(typed[1]);
    expect(next[4]).toEqual(saved[0]);
    expect(next[5]).toEqual(row(['size-2lb', 'flavour-red']));
  });

  it('fills one value in every row, or in the rows of one option, each cell staying its own (ATR-17)', () => {
    const rows = combinations([SIZE, FLAVOUR]).map((ids) => row(ids));
    const all = fillAll(rows, 'openingStock', '5', null);
    expect(all.every((each) => each.openingStock === '5')).toBe(true);
    const big = fillAll(rows, 'price', '1600', 'size-2lb');
    expect(big.map((each) => each.price)).toEqual(['', '', '', '1600', '1600', '1600']);
  });

  it('offers the option sets sharing a value with the options, or every set while there are none (ATR-16)', () => {
    const sets = [
      { name: 'S–XXL', options: ['S', 'M', 'L'] },
      { name: 'Common colours', options: ['Black', 'White'] },
    ];
    expect(setsFor([{ value: 'black' }], sets).map((set) => set.name)).toEqual(['Common colours']);
    expect(setsFor([], sets)).toEqual(sets);
  });

  it('offers a role only when the type can take it, and says why not (ATL-02, ATR-08, ATR-14)', () => {
    expect(roleRefusals(AttributeDataType.EnumSingle, 0)).toEqual({
      [AttributeRole.CapturedAtOrder]: 'textOrNumber',
    });
    expect(roleRefusals(AttributeDataType.Text, 0)).toEqual({
      [AttributeRole.VariantDefining]: 'needsOptions',
    });
    expect(roleRefusals(AttributeDataType.EnumMulti, 0)).toEqual({
      [AttributeRole.VariantDefining]: 'needsOptions',
      [AttributeRole.CapturedAtOrder]: 'textOrNumber',
    });
    expect(roleRefusals(AttributeDataType.NumberWithUnit, 3)).toEqual({
      [AttributeRole.VariantDefining]: 'full',
    });
  });
});

const describing = (dataType: AttributeDataType, patch: Partial<Description>): Description => ({
  attributeId: 'a',
  name: 'A',
  dataType,
  unitKind: null,
  role: AttributeRole.Informational,
  optionIds: [],
  optionValues: [],
  text: '',
  number: '',
  bool: null,
  ...patch,
});

describe('a describing value, by its type (ATL-02, ATR-03)', () => {
  it('sends the value its type takes, and nothing when it is empty', () => {
    expect(
      descriptionsBody([
        describing(AttributeDataType.Text, { text: ' 100% cotton ' }),
        describing(AttributeDataType.EnumMulti, { optionIds: ['o-1', 'o-2'] }),
        describing(AttributeDataType.NumberWithUnit, { number: '3.5' }),
        describing(AttributeDataType.Boolean, { bool: false }),
        describing(AttributeDataType.Text, {}),
        describing(AttributeDataType.Text, { role: AttributeRole.CapturedAtOrder, text: 'x' }),
      ]),
    ).toEqual([
      { attributeId: 'a', role: AttributeRole.Informational, textValue: '100% cotton' },
      { attributeId: 'a', role: AttributeRole.Informational, optionIds: ['o-1', 'o-2'] },
      { attributeId: 'a', role: AttributeRole.Informational, numberValue: 3.5 },
      { attributeId: 'a', role: AttributeRole.Informational, boolValue: false },
      { attributeId: 'a', role: AttributeRole.Informational },
      { attributeId: 'a', role: AttributeRole.CapturedAtOrder },
    ]);
  });

  it('says the value on its card as written', () => {
    const words = { yes: 'Yes', no: 'No', measure: (value: string) => `${value} g` };
    expect(describedValue(describing(AttributeDataType.Boolean, { bool: true }), words)).toBe(
      'Yes',
    );
    expect(
      describedValue(
        describing(AttributeDataType.EnumMulti, { optionValues: ['iPhone 13', 'iPhone 14'] }),
        words,
      ),
    ).toBe('iPhone 13, iPhone 14');
    expect(
      describedValue(describing(AttributeDataType.NumberWithUnit, { number: '3.5' }), words),
    ).toBe('3.5 g');
    expect(describedValue(describing(AttributeDataType.Text, { text: '  ' }), words)).toBeNull();
  });
});

describe('a number with a unit (UOM-02)', () => {
  it('reads in the larger unit from a thousand up', () => {
    expect(measureOf('5000', UnitKind.Weight)).toEqual({ amount: '5', unit: 'kg' });
    expect(measureOf('500', UnitKind.Weight)).toEqual({ amount: '500', unit: 'g' });
    expect(measureOf('1500', UnitKind.Volume)).toEqual({ amount: '1.5', unit: 'l' });
    expect(measureOf('12', UnitKind.Count)).toEqual({ amount: '12', unit: null });
  });

  it('keeps what is typed in the base unit, and refuses what is not a number above nothing', () => {
    expect(baseValueOf('2.5', 'kg')).toBe('2500');
    expect(baseValueOf('250', 'ml')).toBe('250');
    expect(baseValueOf('6', null)).toBe('6');
    expect(baseValueOf('0', 'g')).toBeNull();
    expect(baseValueOf('৫', 'g')).toBeNull();
    expect(baseValueOf('abc', 'g')).toBeNull();
  });
});

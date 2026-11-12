import { AttributeDataType } from '@lytronix/validators/enums';
import { describe, expect, it } from 'vitest';
import type { ModifierGroup, PublicCombo } from '../src/lib/api/storefront-api';
import {
  addOnsPrice,
  addOnsShort,
  answerFits,
  answersOf,
  comboCanBeMade,
  comboChoicesOf,
  comboPartsText,
  modifierChoicesOf,
  openingAddOns,
  openingComboPicks,
  pickComboUnit,
  toggleAddOn,
} from '../src/lib/product/picks';

const option = (id: string, priceChange = '0.00', isDefault = false) => ({
  id,
  name: id,
  priceChange,
  isDefault,
});
const required: ModifierGroup = {
  id: 'size',
  name: 'Packing',
  minSelect: 1,
  maxSelect: 1,
  options: [option('plain', '0.00', true), option('box', '80.00')],
};
const optional: ModifierGroup = {
  id: 'wrap',
  name: 'Gift wrap',
  minSelect: 0,
  maxSelect: 1,
  options: [option('paper', '50.00')],
};
const extras: ModifierGroup = {
  id: 'extras',
  name: 'Extras',
  minSelect: 0,
  maxSelect: 2,
  options: [option('a', '10.00'), option('b', '20.00'), option('c', '-5.00')],
};

describe('add-ons (MNU-01, MNU-02)', () => {
  it('opens with each group at its defaults, as an order naming nothing would', () => {
    expect(openingAddOns([required, optional])).toEqual({ size: ['plain'], wrap: [] });
  });

  it('swaps in a group of one, clearing only when the group may be empty', () => {
    const opening = openingAddOns([required, optional]);
    expect(toggleAddOn(opening, required, 'box')['size']).toEqual(['box']);
    expect(toggleAddOn(opening, required, 'plain')['size']).toEqual(['plain']);
    const wrapped = toggleAddOn(opening, optional, 'paper');
    expect(wrapped['wrap']).toEqual(['paper']);
    expect(toggleAddOn(wrapped, optional, 'paper')['wrap']).toEqual([]);
  });

  it('stops at the most a group takes', () => {
    let picks = openingAddOns([extras]);
    picks = toggleAddOn(picks, extras, 'a');
    picks = toggleAddOn(picks, extras, 'b');
    picks = toggleAddOn(picks, extras, 'c');
    expect(picks['extras']).toEqual(['a', 'b']);
    expect(toggleAddOn(picks, extras, 'a')['extras']).toEqual(['b']);
  });

  it('prices what is picked, a cheaper option included, and names a group short of its least', () => {
    const groups = [{ ...required, options: [option('plain'), option('box', '80.00')] }, extras];
    const none = openingAddOns(groups);
    expect(addOnsShort(groups, none)).toEqual(['size']);
    const picked = toggleAddOn(toggleAddOn(none, extras, 'c'), groups[0] as ModifierGroup, 'box');
    expect(addOnsShort(groups, picked)).toEqual([]);
    expect(addOnsPrice(groups, picked)).toBe(75);
  });

  it('names every group for the order, so one left empty stays empty', () => {
    const groups = [required, optional];
    expect(modifierChoicesOf(groups, openingAddOns(groups))).toEqual([
      { groupId: 'size', optionIds: ['plain'] },
      { groupId: 'wrap', optionIds: [] },
    ]);
  });
});

const combo: PublicCombo = {
  saving: '170.00',
  parts: [
    {
      position: 1,
      quantity: '2.000',
      productName: 'Panjabi',
      image: null,
      choice: true,
      variants: [
        { variantId: 'xs', productName: 'Panjabi', label: 'XS', image: null, available: false },
        { variantId: 'm', productName: 'Panjabi', label: 'M', image: null, available: true },
        { variantId: 'l', productName: 'Panjabi', label: 'L', image: null, available: true },
      ],
    },
    {
      position: 2,
      quantity: '1.000',
      productName: 'Lungi',
      image: null,
      choice: false,
      variants: [
        { variantId: 'lungi', productName: 'Lungi', label: '', image: null, available: true },
      ],
    },
    {
      position: 3,
      quantity: '2.000',
      productName: 'Socks',
      image: null,
      choice: false,
      variants: [
        { variantId: 'socks', productName: 'Socks', label: 'Black', image: null, available: true },
      ],
    },
  ],
};

describe("a combo's choices (CMB-03, CMB-09)", () => {
  it('opens with the first that can be had, for each unit of a choice part only', () => {
    expect(openingComboPicks(combo)).toEqual({ 1: ['m', 'm'] });
    expect(openingComboPicks(null)).toEqual({});
  });

  it('picks unit by unit, and names the choice parts for the order', () => {
    const picks = pickComboUnit(openingComboPicks(combo), 1, 1, 'l');
    expect(comboChoicesOf(picks)).toEqual([{ part: 1, variantIds: ['m', 'l'] }]);
  });

  it('says all its parts in words: each choice as picked, a fixed part with its units', () => {
    const picks = pickComboUnit(openingComboPicks(combo), 1, 1, 'l');
    expect(comboPartsText(combo, picks)).toBe('Panjabi M, Panjabi L, Lungi, Socks Black × 2');
  });

  it('cannot be made once any part has nothing that can be had', () => {
    expect(comboCanBeMade(combo)).toBe(true);
    expect(comboCanBeMade(null)).toBe(true);
    const short: PublicCombo = {
      ...combo,
      parts: combo.parts.map((part) =>
        part.position === 2
          ? { ...part, variants: part.variants.map((each) => ({ ...each, available: false })) }
          : part,
      ),
    };
    expect(comboCanBeMade(short)).toBe(false);
    const empty: PublicCombo = {
      ...combo,
      parts: [{ ...combo.parts[0], variants: [] } as PublicCombo['parts'][number]],
    };
    expect(comboCanBeMade(empty)).toBe(false);
  });
});

describe('what the shop asks (ATR-08)', () => {
  const text = { attributeId: 't', name: 'Name', dataType: AttributeDataType.Text };
  const number = { attributeId: 'n', name: 'Age', dataType: AttributeDataType.NumberWithUnit };

  it('takes any text, and a number only once anything is typed', () => {
    expect(answerFits(text, {})).toBe(true);
    expect(answerFits(text, { t: 'anything' })).toBe(true);
    expect(answerFits(number, {})).toBe(true);
    expect(answerFits(number, { n: '  ' })).toBe(true);
    expect(answerFits(number, { n: '12.5' })).toBe(true);
    expect(answerFits(number, { n: 'twelve' })).toBe(false);
  });

  it('keeps only what was answered, trimmed', () => {
    expect(answersOf([text, number], { t: '  Rafi ', n: '  ' })).toEqual([
      { attributeId: 't', name: 'Name', value: 'Rafi' },
    ]);
  });
});

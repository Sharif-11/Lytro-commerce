import { AttributeDataType, StockState } from '@lytronix/validators/enums';
import { describe, expect, it } from 'vitest';
import type { ProductOption, ProductVariant } from '../src/lib/api/storefront-api';
import { VariantChoice } from '../src/lib/product/variant-choice';

const option = (attributeId: string, ...ids: string[]): ProductOption => ({
  attributeId,
  name: attributeId,
  dataType: AttributeDataType.EnumSingle,
  unitKind: null,
  values: ids.map((id) => ({ id, value: id, swatchColor: null, swatchImage: null })),
});
const variant = (id: string, optionIds: string[], available = true): ProductVariant => ({
  id,
  optionIds,
  price: '100',
  stockState: available ? StockState.In : StockState.Out,
  available,
});

const options = [option('size', 'm', 'l'), option('colour', 'navy', 'white')];
const variants = [
  variant('m-navy', ['m', 'navy'], false),
  variant('m-white', ['white', 'm']),
  variant('l-navy', ['l', 'navy']),
];
const choice = new VariantChoice(options, variants);

describe('VariantChoice (SFT-04, ATR-07, LND-06)', () => {
  it('opens on the linked variant, else the first that can be bought', () => {
    expect(choice.initial('l-navy')).toEqual({ size: 'l', colour: 'navy' });
    expect(choice.initial('m-navy')).toEqual({ size: 'm', colour: 'navy' });
    expect(choice.initial(null)).toEqual({ size: 'm', colour: 'white' });
    expect(choice.initial('no-such-variant')).toEqual({ size: 'm', colour: 'white' });
  });

  it('names the variant picked, whatever order its options are listed in', () => {
    expect(choice.variantFor({ size: 'm', colour: 'white' })?.id).toBe('m-white');
    expect(choice.variantFor({ size: 'l', colour: 'white' })).toBeNull();
    expect(choice.variantFor({ size: 'l' })).toBeNull();
  });

  it('marks a value that leads to nothing buyable with the other picks', () => {
    const picks = { size: 'm', colour: 'white' };
    expect(choice.canBuyWith(picks, 'colour', 'navy')).toBe(false);
    expect(choice.canBuyWith(picks, 'size', 'l')).toBe(false);
    expect(choice.canBuyWith({ size: 'l', colour: 'navy' }, 'size', 'l')).toBe(true);
  });

  it('has the one variant of a product without options', () => {
    const single = new VariantChoice([], [variant('only', [])]);
    expect(single.initial(null)).toEqual({});
    expect(single.variantFor({})?.id).toBe('only');
  });
});

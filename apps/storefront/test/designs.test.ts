import { AttributeDataType, StockState } from '@lytronix/validators/enums';
import { describe, expect, it } from 'vitest';
import type { ProductImage, ProductOption, ProductVariant } from '../src/lib/api/storefront-api';
import {
  designSoldOut,
  galleryShapeOf,
  lineImageOf,
  photoCardsOf,
} from '../src/lib/product/designs';
import { VariantChoice } from '../src/lib/product/variant-choice';

// ATR-19, ATR-20 (PHOTO-DESIGNS-PLAN PD-4, PD-6, PD-7, PD-12, PD-17, PD-24, PD-28): a burka whose photos are its designs.

const photo = (id: string, designId: string | null, width = 600, height = 900): ProductImage => ({
  id,
  urls: { main: `https://cdn.test/${id}.jpg`, thumbnail: `https://cdn.test/${id}-t.jpg` },
  width,
  height,
  designId,
});
const value = (id: string) => ({ id, value: id, swatchColor: null, swatchImage: null });
const option = (attributeId: string, designs: boolean, ...ids: string[]): ProductOption => ({
  attributeId,
  name: designs ? 'ডিজাইন' : 'Size',
  dataType: AttributeDataType.EnumSingle,
  unitKind: null,
  designs,
  values: ids.map(value),
});
const variant = (id: string, optionIds: string[], available = true): ProductVariant => ({
  id,
  optionIds,
  price: '2450.00',
  stockState: available ? StockState.In : StockState.Out,
  available,
});

// Photos 2 and 3 are one design's two angles; the last is a plain photo; design d3 is sold out.
const images = [
  photo('p1', 'd1'),
  photo('p2', 'd2'),
  photo('p3', 'd2'),
  photo('p4', 'd3'),
  photo('p5', null),
];
const sizes = option('size', false, '52', '54');
const options = [option('design', true, 'd1', 'd2', 'd3'), sizes];
const variants = [
  variant('d1-52', ['d1', '52']),
  variant('d1-54', ['d1', '54'], false),
  variant('d2-52', ['d2', '52']),
  variant('d2-54', ['d2', '54']),
  variant('d3-52', ['d3', '52'], false),
  variant('d3-54', ['d3', '54'], false),
];
const burka = { images, options, variants };

describe('photo cards (PD-4, PD-12)', () => {
  it('are every design photo, in the gallery order, plain photos left out', () => {
    expect(photoCardsOf(burka).map((card) => [card.at, card.designId])).toEqual([
      [0, 'd1'],
      [1, 'd2'],
      [2, 'd2'],
      [3, 'd3'],
    ]);
  });

  it('are none for a product with one design, or none at all', () => {
    const one = { images: [photo('p1', 'd1')], options: [option('design', true, 'd1')] };
    expect(photoCardsOf(one)).toEqual([]);
    expect(photoCardsOf({ images, options: [option('size', false, '52')] })).toEqual([]);
  });
});

describe('a sold-out design (PD-17)', () => {
  it('is one none of whose variants can be bought', () => {
    expect(designSoldOut(burka, 'd3')).toBe(true);
    expect(designSoldOut(burka, 'd1')).toBe(false);
  });
});

describe('the photo an order line keeps (PD-6, PD-7)', () => {
  it("is the variant's design's cover, its first photo, whichever angle was tapped", () => {
    expect(lineImageOf(burka, variant('d2-54', ['d2', '54']))).toBe('https://cdn.test/p2-t.jpg');
  });

  it("is the product's first photo for a product without designs, or before a variant", () => {
    const plain = { images: [photo('a', null), photo('b', null)], options: [sizes] };
    expect(lineImageOf(plain, variant('52', ['52']))).toBe('https://cdn.test/a-t.jpg');
    expect(lineImageOf(burka, null)).toBe('https://cdn.test/p1-t.jpg');
  });
});

describe("the gallery's shape (PD-28)", () => {
  it("is the first photo's, held between 9:16 and 1:1", () => {
    expect(galleryShapeOf({ images: [photo('a', null, 600, 900)] })).toBeCloseTo(2 / 3);
    expect(galleryShapeOf({ images: [photo('a', null, 300, 1000)] })).toBeCloseTo(9 / 16);
    expect(galleryShapeOf({ images: [photo('a', null, 1600, 900)] })).toBe(1);
  });

  it("is the drawn 4:5 when the photo's size isn't known", () => {
    expect(galleryShapeOf({ images: [{ ...photo('a', null), width: null, height: null }] })).toBe(
      0.8,
    );
    expect(galleryShapeOf({ images: [] })).toBe(0.8);
  });
});

describe('what the page opens with (PD-4, PD-12, PD-24)', () => {
  const choice = new VariantChoice(options, variants);

  it('chooses no design until a photo is tapped, keeping the size as before', () => {
    expect(choice.opening(null)).toEqual({ size: '52' });
  });

  it("opens a shared link on its variant's design and size", () => {
    expect(choice.opening('d2-54')).toEqual({ design: 'd2', size: '54' });
  });

  it('chooses the one design of a product with one', () => {
    const one = new VariantChoice(
      [option('design', true, 'd1'), sizes],
      [variant('d1-52', ['d1', '52'])],
    );
    expect(one.opening(null)).toEqual({ design: 'd1', size: '52' });
  });

  it('leaves a size buyable while no design is chosen, and strikes one no design has', () => {
    expect(choice.canBuyWith({}, 'size', '54')).toBe(true);
    const fewer = new VariantChoice(
      options,
      variants.filter((each) => each.id !== 'd2-54'),
    );
    expect(fewer.canBuyWith({}, 'size', '54')).toBe(false);
  });
});

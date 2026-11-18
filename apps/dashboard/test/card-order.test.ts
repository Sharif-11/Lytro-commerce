import { StockState, StorefrontCardMode } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import {
  cardKey,
  changesFrom,
  isCompact,
  isShown,
  modesOf,
  moveShown,
  moveToEnd,
  orderInput,
} from '../src/views/design/card-order';
import type { StorefrontCard } from '../src/types/storefront-design';

// STOREFRONT-BUILDER-PLAN DC-6 to DC-8: the Product list's order -- which cards show under each product's way, a card
// moved among the shown ones, the count of changes, and what Save order sends.

function card(
  productId: string,
  designId: string | null,
  shown: boolean,
  mode: StorefrontCardMode | null = null,
): StorefrontCard {
  return {
    productId,
    designId,
    name: productId,
    designName: null,
    designNumber: designId === null ? null : Number(designId.slice(1)),
    price: '1150.00',
    stockState: StockState.In,
    active: true,
    image: null,
    placed: false,
    shown,
    mode,
  };
}

const designs = StorefrontCardMode.Designs;
// A shirt in two designs (its own card not shown), then a saree.
const shirt = card('shirt', null, false, designs);
const d1 = card('shirt', 'd1', true, designs);
const d2 = card('shirt', 'd2', true, designs);
const saree = card('saree', null, true);
const order = [shirt, d1, d2, saree];
const keys = (cards: StorefrontCard[]) => cards.map(cardKey);

describe('the Product list (DC-6 to DC-8)', () => {
  it("shows a product's designs, its one card, or both, as the seller picks; its one card marked", () => {
    const modes = modesOf(order);
    expect(order.filter((each) => isShown(each, modes)).map(cardKey)).toEqual([
      'shirt:d1',
      'shirt:d2',
      'saree:',
    ]);
    const compact = { ...modes, shirt: StorefrontCardMode.Compact };
    expect(order.filter((each) => isShown(each, compact)).map(cardKey)).toEqual([
      'shirt:',
      'saree:',
    ]);
    const both = { ...modes, shirt: StorefrontCardMode.Both };
    expect(order.filter((each) => isShown(each, both))).toHaveLength(4);
    expect(isCompact(shirt)).toBe(true);
    expect(isCompact(saree)).toBe(false);
  });

  it('moves a shown card among the shown ones, the hidden ones keeping their places', () => {
    const modes = modesOf(order);
    // The saree (shown 2) up to the first design's place (shown 0).
    expect(keys(moveShown(order, modes, 2, 0))).toEqual([
      'shirt:',
      'saree:',
      'shirt:d1',
      'shirt:d2',
    ]);
    expect(keys(moveShown(order, modes, 0, 2))).toEqual([
      'shirt:',
      'shirt:d2',
      'saree:',
      'shirt:d1',
    ]);
    expect(keys(moveToEnd(order, modes, 2, 'top'))).toEqual(keys(moveShown(order, modes, 2, 0)));
    expect(keys(moveToEnd(order, modes, 0, 'bottom'))).toEqual([
      'shirt:',
      'shirt:d2',
      'saree:',
      'shirt:d1',
    ]);
    expect(keys(moveShown(order, modes, 1, 1))).toEqual(keys(order));
  });

  it("counts the cards moved and the ways changed, and sends the shown cards and every product's way", () => {
    const modes = modesOf(order);
    const moved = moveShown(order, modes, 2, 0);
    expect(changesFrom(order, modes, order, modes)).toBe(0);
    expect(changesFrom(order, modes, moved, modes)).toBe(3);
    const both = { ...modes, shirt: StorefrontCardMode.Both };
    expect(changesFrom(order, modes, order, both)).toBeGreaterThan(0);
    expect(orderInput(moved, modes)).toEqual({
      cards: [
        { productId: 'saree', designId: null },
        { productId: 'shirt', designId: 'd1' },
        { productId: 'shirt', designId: 'd2' },
      ],
      modes: [{ productId: 'shirt', mode: designs }],
    });
  });
});

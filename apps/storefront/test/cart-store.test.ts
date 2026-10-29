import { ORDER_LINES_MAX } from '@lytronix/validators/common';
import { describe, expect, it } from 'vitest';
import { type CartLine, CartStore, type CartStorage } from '../src/lib/cart/cart-store';

function memory(initial: string | null = null): CartStorage {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}
const line = (variantId: string, quantity = 1): CartLine => ({
  variantId,
  productSlug: 'panjabi',
  name: 'Panjabi',
  choice: 'M',
  price: '1850',
  image: null,
  quantity,
});

describe('CartStore (SFT-05)', () => {
  it('keeps one line per variant, adding to its quantity', () => {
    const cart = new CartStore(memory());
    cart.add(line('a', 2));
    cart.add(line('b'));
    cart.add(line('a'));
    expect(cart.lines().map((held) => [held.variantId, held.quantity])).toEqual([
      ['a', 3],
      ['b', 1],
    ]);
    expect(cart.count()).toBe(4);
  });

  it('refuses a new line past what one order may hold', () => {
    const cart = new CartStore(memory());
    for (let at = 0; at < ORDER_LINES_MAX; at += 1) {
      expect(cart.add(line(`v${String(at)}`))).toBe(true);
    }
    expect(cart.add(line('one-more'))).toBe(false);
    expect(cart.add(line('v0'))).toBe(true);
  });

  it('reads a damaged or foreign store as an empty cart, and works with no store at all', () => {
    expect(new CartStore(memory('{not json')).lines()).toEqual([]);
    expect(new CartStore(memory('[{"variantId":1}]')).lines()).toEqual([]);
    const blocked = new CartStore(null);
    expect(blocked.add(line('a'))).toBe(true);
    expect(blocked.lines()).toEqual([]);
  });
});

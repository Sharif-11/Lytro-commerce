import { ORDER_LINES_MAX } from '@lytronix/validators/common';
import { describe, expect, it } from 'vitest';
import {
  type CartLine,
  CartStore,
  type CartStorage,
  estimateItemOf,
  lineKey,
  orderItemOf,
} from '../src/lib/cart/cart-store';

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

  it('puts a removed line back where it was, onto its twin if one came meanwhile (PD-21)', () => {
    const cart = new CartStore(memory());
    cart.add(line('a'));
    cart.add(line('b', 2));
    cart.add(line('c'));
    const [, removed] = cart.lines();
    if (!removed) throw new Error('the cart holds three lines');
    cart.remove(lineKey(removed));
    cart.restore(removed, 1);
    expect(cart.lines().map((held) => [held.variantId, held.quantity])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 1],
    ]);
    cart.remove(lineKey(removed));
    cart.add(line('b'));
    cart.restore(removed, 1);
    expect(cart.lines().map((held) => [held.variantId, held.quantity])).toEqual([
      ['a', 1],
      ['c', 1],
      ['b', 3],
    ]);
  });

  it('reads a damaged or foreign store as an empty cart, and works with no store at all', () => {
    expect(new CartStore(memory('{not json')).lines()).toEqual([]);
    expect(new CartStore(memory('[{"variantId":1}]')).lines()).toEqual([]);
    const blocked = new CartStore(null);
    expect(blocked.add(line('a'))).toBe(true);
    expect(blocked.lines()).toEqual([]);
  });

  it("changes a line's quantity, removes it at none or on Remove, and says so each time (Slice 12b)", () => {
    let changes = 0;
    const cart = new CartStore(memory(), () => {
      changes += 1;
    });
    cart.add(line('a', 2));
    cart.add(line('b'));
    cart.setQuantity('a', 5);
    expect(cart.lines().map((held) => [held.variantId, held.quantity])).toEqual([
      ['a', 5],
      ['b', 1],
    ]);
    cart.setQuantity('a', 0);
    cart.remove('b');
    cart.setQuantity('missing', 3);
    expect(cart.lines()).toEqual([]);
    expect(changes).toBe(5);
  });

  it('keeps different picks of one variant as different lines, the same picks as one (Slice 4.8e)', () => {
    const cart = new CartStore(memory());
    const wrapped: CartLine = {
      ...line('a'),
      modifiers: [{ groupId: 'g', optionIds: ['wrap'] }],
      addOns: [{ name: 'Gift wrap', priceChange: '50.00' }],
    };
    const named: CartLine = {
      ...line('a'),
      answers: [{ attributeId: 'x', name: 'Name', value: 'Rafi' }],
    };
    cart.add(line('a'));
    cart.add(wrapped);
    cart.add(named);
    cart.add(wrapped);
    expect(cart.lines().map((held) => held.quantity)).toEqual([1, 2, 1]);
    cart.setQuantity(lineKey(wrapped), 5);
    expect(cart.lines()[1]?.quantity).toBe(5);
    cart.remove(lineKey(line('a')));
    expect(cart.lines().map(lineKey)).toEqual([lineKey(wrapped), lineKey(named)]);
    cart.clear();
    expect(cart.lines()).toEqual([]);
  });

  it('reads a group left empty as no pick, so a line with none is the plain variant', () => {
    const empty: CartLine = { ...line('a'), modifiers: [{ groupId: 'g', optionIds: [] }] };
    expect(lineKey(empty)).toBe(lineKey(line('a')));
  });

  it('names what an order and an estimate need of a line, every add-on group included', () => {
    const line_: CartLine = {
      ...line('a', 2),
      modifiers: [
        { groupId: 'g', optionIds: ['wrap'] },
        { groupId: 'h', optionIds: [] },
      ],
      comboPicks: [{ part: 2, variantIds: ['m'] }],
      answers: [{ attributeId: 'x', name: 'Name', value: 'Rafi' }],
    };
    expect(estimateItemOf(line_)).toEqual({
      variantId: 'a',
      quantity: 2,
      modifiers: line_.modifiers,
    });
    expect(orderItemOf(line_)).toEqual({
      variantId: 'a',
      quantity: 2,
      modifiers: line_.modifiers,
      choices: [{ part: 2, variantIds: ['m'] }],
      captured: [{ attributeId: 'x', value: 'Rafi' }],
    });
    expect(orderItemOf(line('b'))).toEqual({ variantId: 'b', quantity: 1 });
  });

  it('reads a line with damaged picks as no line', () => {
    const damaged = JSON.stringify([{ ...line('a'), modifiers: 'x' }]);
    expect(new CartStore(memory(damaged)).lines()).toEqual([]);
  });
});

import { StockState } from '@lytronix/validators/enums';
import { describe, expect, it } from 'vitest';
import type { DeliveryEstimate, EstimateLine } from '../src/lib/api/storefront-api';
import { checkCart } from '../src/lib/cart/cart-check';
import type { CartLine } from '../src/lib/cart/cart-store';

const line = (variantId: string, price: string, quantity = 1): CartLine => ({
  variantId,
  productSlug: variantId,
  name: variantId,
  choice: '',
  price,
  image: null,
  quantity,
});
const answered = (lines: EstimateLine[]): DeliveryEstimate => ({
  lines,
  subtotal: '0.00',
  zone: null,
  deliveryCharge: null,
  range: null,
  deliverable: true,
  notDeliveredHere: [],
});
const sold = (
  variantId: string,
  price: string,
  itemTotal: string,
  advance = '0.00',
): EstimateLine => ({
  variantId,
  onSale: true,
  price,
  stockState: StockState.In,
  available: true,
  itemTotal,
  advance,
});

describe('checkCart (Slice 12b)', () => {
  it('shows the lines as kept until the shop answers', () => {
    const cart = checkCart([line('a', '1250', 2)], null);
    expect(cart.lines[0]).toMatchObject({ state: 'kept', price: '1250', was: null, total: 2500 });
    expect(cart).toMatchObject({ items: 2, subtotal: 2500, orderable: true });
  });

  it('marks a changed price, a sold-out line and one no longer sold; only the rest count', () => {
    const cart = checkCart(
      [line('changed', '1150'), line('out', '1850'), line('same', '350', 2), line('gone', '4500')],
      answered([
        sold('changed', '1250.00', '1250.00'),
        {
          variantId: 'out',
          onSale: true,
          price: '1850.00',
          stockState: StockState.Out,
          available: false,
          itemTotal: null,
          advance: null,
        },
        sold('same', '350.00', '700.00', '200.00'),
        {
          variantId: 'gone',
          onSale: false,
          price: null,
          stockState: null,
          available: false,
          itemTotal: null,
          advance: null,
        },
      ]),
    );
    expect(cart.lines.map((checked) => [checked.state, checked.was, checked.total])).toEqual([
      ['changed', '1150', 1250],
      ['out', null, null],
      ['ready', null, 700],
      ['gone', null, null],
    ]);
    expect(cart.lines[2]?.advance).toBe(200);
    expect(cart.lines[0]?.advance).toBeNull();
    expect(cart).toMatchObject({ items: 3, subtotal: 1950, orderable: true });
  });

  it('has nothing to order when every line is out', () => {
    const cart = checkCart(
      [line('gone', '100')],
      answered([
        {
          variantId: 'gone',
          onSale: false,
          price: null,
          stockState: null,
          available: false,
          itemTotal: null,
          advance: null,
        },
      ]),
    );
    expect(cart).toMatchObject({ items: 0, subtotal: 0, orderable: false });
  });
});

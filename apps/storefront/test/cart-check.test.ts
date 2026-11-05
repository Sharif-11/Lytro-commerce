import { PaymentPolicy, StockState } from '@lytronix/validators/enums';
import { describe, expect, it } from 'vitest';
import type { DeliveryEstimate, EstimateLine } from '../src/lib/api/storefront-api';
import { checkCart, isOffLine, paysFirst, totalWith } from '../src/lib/cart/cart-check';
import { type CartLine, lineKey } from '../src/lib/cart/cart-store';

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
  taxes: [],
  advance: null,
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
  paymentPolicy: Number(advance) > 0 ? PaymentPolicy.PartialAdvance : PaymentPolicy.None,
  choicesFit: true,
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
          paymentPolicy: null,
          choicesFit: true,
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
          paymentPolicy: null,
          choicesFit: true,
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
          paymentPolicy: null,
          choicesFit: true,
        },
      ]),
    );
    expect(cart).toMatchObject({ items: 0, subtotal: 0, orderable: false });
  });

  it('prices add-ons in until the shop answers, then takes its total (Slice 4.8e)', () => {
    const wrapped: CartLine = {
      ...line('a', '1250', 2),
      addOns: [{ name: 'Gift wrap', priceChange: '50.00' }],
      modifiers: [{ groupId: 'g', optionIds: ['o'] }],
    };
    expect(checkCart([wrapped], null).lines[0]?.total).toBe(2600);
    const cart = checkCart([wrapped], answered([sold('a', '1250.00', '2600.00')]));
    expect(cart.lines[0]).toMatchObject({ state: 'ready', was: null, total: 2600 });
  });

  it('answers two lines of one variant in turn, and none with an answer meant for a line since gone', () => {
    const one: CartLine = { ...line('a', '100'), answers: [] };
    const other: CartLine = {
      ...line('a', '100'),
      answers: [{ attributeId: 'x', name: 'Name', value: 'Rafi' }],
    };
    const answer = answered([sold('a', '100.00', '100.00'), sold('a', '100.00', '700.00')]);
    expect(checkCart([one, other], answer).lines.map((checked) => checked.total)).toEqual([
      100, 700,
    ]);
    expect(lineKey(one)).not.toBe(lineKey(other));
    expect(checkCart([other], answered([sold('b', '100.00', '100.00')])).lines[0]?.state).toBe(
      'kept',
    );
  });

  it('leaves out a line whose add-ons no longer fit, and one the shop just refused (Slice 4.8e)', () => {
    const answer = answered([
      { ...sold('a', '100.00', '100.00'), choicesFit: false },
      sold('b', '100.00', '100.00'),
    ]);
    const cart = checkCart([line('a', '100'), line('b', '100')], answer);
    expect(cart.lines.map((checked) => [checked.state, isOffLine(checked)])).toEqual([
      ['refit', true],
      ['ready', false],
    ]);
    expect(cart).toMatchObject({ items: 1, subtotal: 100 });
    const refused = checkCart([line('b', '100')], answer, new Set(['b']));
    expect(refused.lines[0]).toMatchObject({ state: 'out', total: null });
  });

  it('says which lines must be paid for first, a delivery charge first included (PRD-08)', () => {
    const first = (policy: PaymentPolicy) =>
      checkCart(
        [line('a', '100')],
        answered([{ ...sold('a', '100.00', '100.00'), paymentPolicy: policy }]),
      ).lines[0];
    const none = first(PaymentPolicy.None);
    const charge = first(PaymentPolicy.DeliveryChargeOnly);
    expect(none && paysFirst(none)).toBe(false);
    expect(charge && paysFirst(charge)).toBe(true);
  });

  it('adds a charge, a range or nothing to a sum', () => {
    expect(totalWith(100, 70, null)).toEqual({ from: 170, to: 170 });
    expect(totalWith(100, null, { from: '70.00', to: '130.00' })).toEqual({ from: 170, to: 230 });
    expect(totalWith(100, null, null)).toEqual({ from: 100, to: 100 });
  });
});

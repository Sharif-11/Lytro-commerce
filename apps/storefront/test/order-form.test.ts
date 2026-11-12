import { StockUnit } from '@lytronix/validators/enums';
import { describe, expect, it } from 'vitest';
import { Words } from '../src/lib/i18n/words';
import {
  NO_FIELDS,
  orderBody,
  orderFieldProblems,
  type OrderFields,
  quantityText,
  readOrderAnswer,
} from '../src/lib/order/order-form';

const filled: OrderFields = {
  customerName: ' Rumana Akter ',
  phone: '01711 223344',
  thanaId: 3,
  deliveryAddress: 'House 12/B',
  shopperNote: '',
};

describe('the order form (SFT-06, LND-07)', () => {
  it('names each field to fix, in the order the form shows them', () => {
    expect(orderFieldProblems(NO_FIELDS)).toEqual([
      'customerName',
      'phone',
      'locationId',
      'deliveryAddress',
    ]);
    expect(orderFieldProblems(filled)).toEqual([]);
    expect(orderFieldProblems({ ...filled, phone: '0171' })).toEqual(['phone']);
    expect(orderFieldProblems({ ...filled, deliveryAddress: '   ' })).toEqual(['deliveryAddress']);
  });

  it('sends what was typed, trimmed, and no note when none was written', () => {
    const items = [{ variantId: 'a', quantity: 1 }];
    expect(orderBody(filled, items, 'storefront')).toEqual({
      customerName: 'Rumana Akter',
      phone: '01711 223344',
      locationId: 3,
      deliveryAddress: 'House 12/B',
      source: 'storefront',
      items,
    });
    expect(orderBody({ ...filled, shopperNote: ' Call first ' }, items, 'landing_page')).toEqual(
      expect.objectContaining({ shopperNote: 'Call first', source: 'landing_page' }),
    );
  });
});

describe('the answer to an order (ORD-02)', () => {
  const conflict = (details: Record<string, unknown>) => ({ code: 'conflict', details });

  it('takes the order placed, a replay included', () => {
    const order = { trackingId: 'K7F2M9QX' };
    expect(readOrderAnswer(201, { data: order })).toEqual({ kind: 'placed', order });
    expect(readOrderAnswer(200, { data: order })).toEqual({ kind: 'placed', order });
    expect(readOrderAnswer(201, { data: null })).toEqual({ kind: 'failed' });
  });

  it("shows the form's fields as its own; an item's problem only a fresh check can name", () => {
    const fields = (...names: string[]) => ({
      code: 'validation_error',
      details: { fields: names.map((field) => ({ field, problem: 'invalid_format' })) },
    });
    expect(readOrderAnswer(422, fields('phone', 'locationId'))).toEqual({
      kind: 'fields',
      fields: ['phone', 'locationId'],
    });
    expect(readOrderAnswer(422, fields('items.0.modifiers'))).toEqual({ kind: 'recheck' });
    expect(readOrderAnswer(422, fields('payment'))).toEqual({ kind: 'advance' });
    expect(readOrderAnswer(422, fields('payment.method'))).toEqual({ kind: 'advance' });
  });

  it('tells sold out, no delivery and paying first apart', () => {
    expect(readOrderAnswer(409, conflict({ productId: 'p', variantId: 'v' }))).toEqual({
      kind: 'sold_out',
      variantId: 'v',
    });
    expect(
      readOrderAnswer(409, conflict({ reason: 'product_unavailable', variantId: 'v' })),
    ).toEqual({ kind: 'sold_out', variantId: 'v' });
    expect(readOrderAnswer(409, conflict({ productId: 'p' }))).toEqual({
      kind: 'sold_out',
      variantId: null,
    });
    for (const reason of ['zone_no_delivery', 'product_not_delivered_here']) {
      expect(readOrderAnswer(409, conflict({ reason }))).toEqual({ kind: 'no_delivery' });
    }
    expect(readOrderAnswer(409, conflict({ reason: 'no_payment_method' }))).toEqual({
      kind: 'no_method',
    });
    expect(readOrderAnswer(409, conflict({ reason: 'new_shop_cap' }))).toEqual({ kind: 'cap' });
  });

  it('reads too many tries, a spent key, and anything else as worth trying again', () => {
    expect(readOrderAnswer(429, { code: 'rate_limited' })).toEqual({ kind: 'busy' });
    expect(readOrderAnswer(409, { code: 'idempotency_conflict' })).toEqual({ kind: 'key_spent' });
    expect(readOrderAnswer(503, { code: 'unavailable' })).toEqual({ kind: 'failed' });
    expect(readOrderAnswer(500, null)).toEqual({ kind: 'failed' });
    expect(readOrderAnswer(400, null)).toEqual({ kind: 'failed' });
  });
});

describe('a quantity in words', () => {
  const words = new Words('en');

  it('names the unit of a measure and of a count alike (UOM-05, PD-19)', () => {
    expect(quantityText('1.000', StockUnit.Piece, words)).toBe('1 piece');
    expect(quantityText('3.000', StockUnit.Piece, words)).toBe('3 pieces');
    expect(quantityText('1.500', StockUnit.Kg, words)).toBe('1.5 kg');
    expect(quantityText('2.000', StockUnit.Pack, words)).toBe('2 packs');
    expect(quantityText('2.000', StockUnit.Dozen, words)).toBe('2 dozen');
  });

  it('writes the Bangla unit once, whatever the count', () => {
    const bangla = new Words('bn');
    expect(quantityText('1.000', StockUnit.Piece, bangla)).toBe('1 পিস');
    expect(quantityText('2.000', StockUnit.Dozen, bangla)).toBe('2 ডজন');
    expect(quantityText('0.500', StockUnit.Kg, bangla)).toBe('0.5 কেজি');
  });
});

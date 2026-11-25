import { describe, expect, it } from 'vitest';
import { OrderSource } from '@lytronix/validators';
import { orderPlacedText } from '../src/modules/notifications/notification-words';

// ORD-20, NTF-03 as amended (ORDERS-BEYOND-STOCK OB-10, the owner 2026-11-25): a shopper's order that arrived short of
// stock says so in its notice, so the seller adds stock before calling; a locked one too, still naming no one.
describe('the new-order notice (ORD-20, OB-10)', () => {
  const order = {
    orderNumber: '261125-0007',
    customerName: 'Rahima',
    grandTotal: '1250.00',
    source: OrderSource.Storefront,
  };

  it('says "স্টক কম" when the order waits for stock, and nothing of stock when it does not', () => {
    const short = orderPlacedText({ ...order, short: true });
    expect(short.bn.body.endsWith(' · স্টক কম')).toBe(true);
    expect(short.en.body.endsWith(' · Short of stock')).toBe(true);
    const covered = orderPlacedText(order);
    expect(covered.bn.body).not.toContain('স্টক');
    expect(covered.en.body).not.toContain('stock');
  });

  it('says it on a locked order too, with no name', () => {
    const locked = orderPlacedText({
      ...order,
      customerName: null,
      locked: { district: { bn: 'ঢাকা', en: 'Dhaka' }, fee: '7.00' },
      short: true,
    });
    expect(locked.bn.body.startsWith('৳1250.00 · ঢাকা · ')).toBe(true);
    expect(locked.bn.body.endsWith(' · খুলতে ৳7 · স্টক কম')).toBe(true);
    expect(locked.en.body.endsWith(' · Short of stock')).toBe(true);
    expect(locked.en.body).not.toContain('Rahima');
  });
});

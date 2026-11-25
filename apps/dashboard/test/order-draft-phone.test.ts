import { describe, expect, it } from 'vitest';
import { PaymentMethod } from '@lytronix/validators';
import { createOf, EMPTY_DRAFT, phoneOf } from '../src/views/orders/order-draft';

// The owner, 2026-11-25: the phone box takes the number from 0, as people write it; the server still gets +880….
describe("New order's phone, typed as people write it", () => {
  it('finds the customer by the local form, whichever way the number is typed', () => {
    for (const typed of ['01711234567', '1711 234 567', '+8801711234567', '017-1123-4567']) {
      expect(phoneOf(typed), typed).toBe('01711234567');
    }
    expect(phoneOf('0171123')).toBeNull();
  });

  it('sends the customer phone and a wallet sender as +880…, and a number that does not read as typed', () => {
    const order = createOf(
      {
        ...EMPTY_DRAFT,
        phone: '01711234567',
        paid: true,
        method: PaymentMethod.Bkash,
        sender: '01819 876 543',
        amount: '100',
        trxId: '9F2KQ7',
      },
      false,
    );
    expect(order.phone).toBe('+8801711234567');
    expect(order.payment).toMatchObject({ senderNumber: '+8801819876543' });
    // The server names what is wrong with it, under the field.
    expect(createOf({ ...EMPTY_DRAFT, phone: '0171123' }, false).phone).toBe('0171123');
  });
});

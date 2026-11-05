import { OrderStatus, PaymentSessionState } from '@lytronix/validators/enums';
import { describe, expect, it } from 'vitest';
import { minutesLeft, paymentStandingOf } from '../src/lib/order/payment-return';

const owing = { grandTotal: '1920.00', codAmount: '1720.00' };
const open = (state: PaymentSessionState) => ({
  paymentUrl: 'https://pay.example/ref',
  amount: '200.00',
  expiresAt: '2026-11-05T10:00:00.000Z',
  state,
});

describe('what an order says of its advance (PAY-08, PAY-11)', () => {
  it('says nothing of an order that owed none', () => {
    expect(
      paymentStandingOf({
        grandTotal: '1920.00',
        codAmount: '1920.00',
        status: OrderStatus.Pending,
        payment: null,
      }),
    ).toBeNull();
  });

  it('calls an open payment unpaid, and one being looked at checking', () => {
    const at = (state: PaymentSessionState) =>
      paymentStandingOf({ ...owing, status: OrderStatus.Unverified, payment: open(state) });
    expect(at(PaymentSessionState.AwaitingPayment)).toBe('unpaid');
    expect(at(PaymentSessionState.Checking)).toBe('checking');
    expect(at(PaymentSessionState.NeedsReview)).toBe('checking');
    expect(at(PaymentSessionState.Expired)).toBe('gone');
  });

  it('never calls a cancelled order paid, though a cancelled order has no payment to read', () => {
    expect(paymentStandingOf({ ...owing, status: OrderStatus.Cancelled, payment: null })).toBe(
      'gone',
    );
  });

  it('calls it paid only once the order has moved on from waiting', () => {
    expect(paymentStandingOf({ ...owing, status: OrderStatus.Pending, payment: null })).toBe(
      'paid',
    );
    expect(paymentStandingOf({ ...owing, status: OrderStatus.Unverified, payment: null })).toBe(
      'checking',
    );
  });
});

describe('the minutes an order is still held (PAY-03)', () => {
  const now = Date.parse('2026-11-05T10:00:00.000Z');

  it('counts whole minutes up, and never says none while it is open', () => {
    expect(minutesLeft('2026-11-05T10:18:00.000Z', now)).toBe(18);
    expect(minutesLeft('2026-11-05T10:17:01.000Z', now)).toBe(18);
    expect(minutesLeft('2026-11-05T09:59:00.000Z', now)).toBe(1);
  });
});

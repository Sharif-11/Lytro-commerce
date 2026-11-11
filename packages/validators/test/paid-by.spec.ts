import { describe, expect, it } from 'vitest';
import { PAID_BY_METHODS, PLAN_PAYMENT_METHODS, PaymentMethod, paidByOf } from '../src';

// BIL-12, ADM-14 (the owner, 2026-11-11, KNOWN-GAPS §142): an invoice and Billing name how a paid request went --
// the balance, a wallet's TrxID, or a transfer to one of Lytro's bank accounts.
describe('how a payment went', () => {
  it('is the balance when no TrxID or reference came, whatever method the page was on', () => {
    expect(paidByOf(null, null)).toBe('balance');
    expect(paidByOf(null, PaymentMethod.Bank)).toBe('balance');
  });

  it('is the bank when the bank method carried the reference', () => {
    expect(paidByOf('BRAC-FT-2211', PaymentMethod.Bank)).toBe('bank');
  });

  it('is a wallet for any other method, or none recorded', () => {
    expect(paidByOf('9F2KQ7XM1A', PaymentMethod.Bkash)).toBe('wallet');
    expect(paidByOf('9F2KQ7XM1A', PaymentMethod.Nagad)).toBe('wallet');
    expect(paidByOf('9F2KQ7XM1A', null)).toBe('wallet');
  });

  it("names one more way than a shop's request can ask for", () => {
    expect(PAID_BY_METHODS).toEqual([...PLAN_PAYMENT_METHODS, 'bank']);
  });
});

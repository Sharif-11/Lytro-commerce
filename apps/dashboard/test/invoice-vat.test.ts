import { describe, expect, it } from 'vitest';
import type { Invoice } from '../src/types/billing';
import { explainsNoVat, issuedOf, vatOf } from '../src/views/billing/invoice-vat';

// D9-7, D9-26 (Slice 9.9): which invoices state VAT and take the Mushak-6.3 form, and which balance-paid invoice says
// why it shows none.

function invoice(given: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv',
    tenantId: 'shop',
    number: 214,
    kind: 'renewal',
    planSnapshot: null,
    amount: '449.00',
    creditAmount: '0.00',
    billingTermLabel: null,
    // 10 Oct 2026, 9:31 am in Dhaka.
    issuedAt: '2026-10-10T03:31:00.000Z',
    paymentMethod: 'wallet',
    paymentReference: '5KD9QW',
    sellerName: null,
    sellerAddress: null,
    sellerBin: null,
    vatRate: null,
    vatAmount: null,
    shopAddress: null,
    ...given,
  };
}

const REGISTERED: Partial<Invoice> = {
  sellerName: 'Lytro',
  sellerAddress: 'House 12, Road 4, Nasirabad, Chattogram 4000',
  sellerBin: '004512367-0101',
  vatRate: '15.00',
  vatAmount: '58.57',
  shopAddress: 'Shop 12, Rapa Plaza, Dhanmondi, Dhaka',
};

describe('vatOf', () => {
  it('is null on an invoice issued before Lytro was registered, as every invoice is today', () => {
    expect(vatOf(invoice())).toBeNull();
  });

  it('needs all five: a part of them is no tax invoice', () => {
    expect(vatOf(invoice({ ...REGISTERED, vatAmount: null }))).toBeNull();
    expect(vatOf(invoice({ ...REGISTERED, sellerBin: '' }))).toBeNull();
  });

  it('gives the registration and the VAT, the rate as a person reads it', () => {
    expect(vatOf(invoice(REGISTERED))).toEqual({
      sellerName: 'Lytro',
      sellerAddress: 'House 12, Road 4, Nasirabad, Chattogram 4000',
      sellerBin: '004512367-0101',
      rate: '15',
      amount: '58.57',
    });
    expect(vatOf(invoice({ ...REGISTERED, vatRate: '7.50' }))?.rate).toBe('7.5');
  });
});

describe('issuedOf', () => {
  it('is the day on an invoice, and the day and the time on a tax invoice', () => {
    expect(issuedOf(invoice(), false, 'en')).toBe('10 Oct 2026');
    expect(issuedOf(invoice(), true, 'en')).toBe('10 Oct 2026, 9:31 am');
    expect(issuedOf(invoice(), true, 'bn')).toBe('10 Oct 2026, সকাল 9:31');
  });
});

describe('explainsNoVat', () => {
  const fromBalance = invoice({
    id: 'bal',
    number: 215,
    paymentMethod: 'balance',
    paymentReference: null,
    issuedAt: '2026-10-10T03:00:00.000Z',
  });

  it('says why on a balance-paid invoice once a tax invoice was issued before it', () => {
    const topUp = invoice({
      ...REGISTERED,
      id: 'top',
      kind: 'top_up',
      issuedAt: '2026-10-09T10:12:00.000Z',
    });
    expect(explainsNoVat(fromBalance, [topUp, fromBalance])).toBe(true);
  });

  it('says nothing before Lytro was registered, nor for a tax invoice issued after it', () => {
    expect(explainsNoVat(fromBalance, [fromBalance, invoice()])).toBe(false);
    const later = invoice({ ...REGISTERED, id: 'later', issuedAt: '2026-10-19T10:12:00.000Z' });
    expect(explainsNoVat(fromBalance, [fromBalance, later])).toBe(false);
  });

  it('is only for an invoice paid from the balance', () => {
    const topUp = invoice({ ...REGISTERED, id: 'top', issuedAt: '2026-10-01T10:12:00.000Z' });
    expect(explainsNoVat(invoice(), [topUp])).toBe(false);
    expect(explainsNoVat(invoice({ ...REGISTERED, id: 'x' }), [topUp])).toBe(false);
  });
});

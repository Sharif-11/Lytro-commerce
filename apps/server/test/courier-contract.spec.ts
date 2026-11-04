import { describe, expect, it } from 'vitest';
import { refusalWords } from '../src/modules/couriers/services/courier-http';
import { SteadfastAdapter } from '../src/modules/couriers/services/steadfast-adapter';
import { courierContract } from './support/courier-contract';
import { FakeSteadfast, RIGHT_API_KEY, RIGHT_SECRET_KEY } from './support/fake-steadfast';

const steadfast = new FakeSteadfast();
const adapter = new SteadfastAdapter('https://portal.packzy.com/api/v1', steadfast.fetch);
const ACCOUNT = {
  tenantId: 'tenant',
  connectionId: 'connection',
  credentials: { apiKey: RIGHT_API_KEY, secretKey: RIGHT_SECRET_KEY },
};

courierContract('Steadfast', () => ({
  adapter,
  account: ACCOUNT,
  badAccount: { ...ACCOUNT, credentials: { apiKey: 'bad-key', secretKey: 'bad-secret' } },
  booking: {
    invoice: '261104-0017',
    recipientName: 'Rahima Akter',
    recipientPhone: '01711234567',
    recipientAddress: 'House 12, Road 3, Mirpur, Dhaka',
    cod: '370.00',
    note: null,
    weightKg: null,
    areaCode: null,
  },
  secrets: [RIGHT_API_KEY, RIGHT_SECRET_KEY, 'bad-key', 'bad-secret'],
  reset: () => {
    steadfast.reset();
  },
  parcels: () => steadfast.consignments.length,
  nextBookingRefused: (words) => {
    steadfast.behaviour = {
      refuseBooking: { status: 400, body: { status: 400, message: words } },
    };
  },
  nextBookingLost: () => {
    steadfast.behaviour = { bookingTimesOut: { madeIt: true } };
  },
  nextBookingPage: () => {
    steadfast.behaviour = { bookingPage: true };
  },
}));

describe('Steadfast, as its guide says (Appendix A)', () => {
  it('sends its key pair and the fields it takes, cash as a number and no weight', async () => {
    steadfast.reset();
    await adapter.book(ACCOUNT, {
      invoice: 'INV-1',
      recipientName: 'Rahima',
      recipientPhone: '01711234567',
      recipientAddress: 'House 12',
      cod: '370.50',
      note: 'Fragile',
      weightKg: '1.000',
      areaCode: null,
    });
    expect(steadfast.bookings()[0]).toEqual({
      method: 'POST',
      path: '/create_order',
      apiKey: RIGHT_API_KEY,
      secretKey: RIGHT_SECRET_KEY,
      body: {
        invoice: 'INV-1',
        recipient_name: 'Rahima',
        recipient_phone: '01711234567',
        recipient_address: 'House 12',
        cod_amount: 370.5,
        note: 'Fragile',
      },
    });
  });

  it('leaves out a note it was not given', async () => {
    steadfast.reset();
    await adapter.book(ACCOUNT, {
      invoice: 'INV-2',
      recipientName: 'Rahima',
      recipientPhone: '01711234567',
      recipientAddress: 'House 12',
      cod: '0.00',
      note: null,
      weightKg: null,
      areaCode: null,
    });
    expect(steadfast.bookings()[0]?.body).not.toHaveProperty('note');
    expect(steadfast.bookings()[0]?.body).toMatchObject({ cod_amount: 0 });
  });

  it('reads a repeated invoice as a refusal, in its field error’s words', async () => {
    steadfast.reset();
    const booking = {
      invoice: 'INV-3',
      recipientName: 'Rahima',
      recipientPhone: '01711234567',
      recipientAddress: 'House 12',
      cod: '10.00',
      note: null,
      weightKg: null,
      areaCode: null,
    };
    await adapter.book(ACCOUNT, booking);
    await expect(adapter.book(ACCOUNT, booking)).resolves.toEqual({
      outcome: 'refused',
      refusal: { message: 'The invoice has already been taken.', login: false },
    });
    expect(steadfast.consignments).toHaveLength(1);
  });

  it('gives a tracking page for a code', () => {
    expect(adapter.trackingLink('15BAEB8A')).toBe('https://steadfast.com.bd/t/15BAEB8A');
  });
});

describe('a courier’s words as staff read them (SEC-16 as amended)', () => {
  it('keeps plain text on one line, within 200 characters, and nothing else', () => {
    expect(refusalWords('Invalid phone.')).toBe('Invalid phone.');
    expect(refusalWords('  <p>Invalid\n\tphone</p> ')).toBe('Invalid phone');
    expect(refusalWords('x'.repeat(500))?.length).toBe(200);
    expect(refusalWords('<br/>')).toBeNull();
    expect(refusalWords(null)).toBeNull();
  });
});

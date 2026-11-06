import { describe, expect, it } from 'vitest';
import { refusalWords } from '../src/modules/couriers/services/courier-http';
import { SteadfastAdapter } from '../src/modules/couriers/services/steadfast-adapter';
import { courierContract } from './support/courier-contract';
import {
  FakeSteadfast,
  RIGHT_API_KEY,
  RIGHT_SECRET_KEY,
  signatureOf,
} from './support/fake-steadfast';

const MESSAGE_TOKEN = 'the-token-the-owner-pasted';
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
    quantity: '1.000',
    areaName: null,
    goodsValue: '370.00',
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
  messageToken: MESSAGE_TOKEN,
  message: (status) => {
    const body = JSON.stringify({
      notification_type: 'delivery_status',
      consignment_id: 1424107,
      invoice: '261104-0017',
      cod_amount: 370,
      status,
      delivery_charge: 60,
      tracking_message: 'Status changed.',
      updated_at: '2026-11-05 12:45:30',
    });
    const headers = { 'idempotency-key': `key-${status}` };
    return {
      rawBody: Buffer.from(body),
      headers,
      good: { ...headers, 'x-signature': signatureOf(body, MESSAGE_TOKEN) },
    };
  },
  strangeStatus: 'teleported',
  deliveredStatus: 'delivered',
  unconfirmedStatus: 'delivered_approval_pending',
  proof: 'body',
  parcelStandsAt: (status) => {
    for (const each of steadfast.consignments) {
      steadfast.statuses.set(String(each.consignmentId), status);
    }
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
      quantity: '1.000',
      areaName: null,
      goodsValue: '370.00',
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
      quantity: '1.000',
      areaName: null,
      goodsValue: '370.00',
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
      quantity: '1.000',
      areaName: null,
      goodsValue: '370.00',
    };
    await adapter.book(ACCOUNT, booking);
    await expect(adapter.book(ACCOUNT, booking)).resolves.toEqual({
      outcome: 'refused',
      refusal: { message: 'The invoice has already been taken.', login: false },
    });
    expect(steadfast.consignments).toHaveLength(1);
  });

  it('reads its statuses however its samples write them, and its times as Dhaka’s', () => {
    const body = JSON.stringify({
      notification_type: 'delivery_status',
      consignment_id: 77,
      invoice: 'INV-9',
      cod_amount: 900.5,
      status: 'Partial Delivered',
      delivery_charge: 60,
      tracking_message: '<b>Half</b> delivered',
      updated_at: '2026-11-05 12:45:30',
    });
    expect(adapter.readMessage(Buffer.from(body), { 'idempotency-key': 'k1' })).toMatchObject({
      dedupeKey: 'k1',
      statusEvent: true,
      forShopper: true,
      consignmentId: '77',
      invoice: 'INV-9',
      rawStatus: 'partial_delivered',
      reading: 'partly_delivered',
      messageEn: 'Half delivered',
      cashCollected: '900.5',
      deliveryCharge: '60',
      happenedAt: new Date('2026-11-05T06:45:30.000Z'),
    });
  });

  it('counts a COD only on a result, and a change in its panel as a change', () => {
    const read = (fields: Record<string, unknown>) =>
      adapter.readMessage(Buffer.from(JSON.stringify(fields)), {});
    expect(
      read({ notification_type: 'delivery_status', status: 'pending', cod_amount: 500 }),
    ).toMatchObject({ cashCollected: null, codAtCourier: null });
    const changed = read({
      notification_type: 'consignment_update',
      consignment_id: 77,
      cod_amount: 450,
    });
    expect(changed).toMatchObject({ statusEvent: false, forShopper: false, codAtCourier: '450' });
    expect(changed?.dedupeKey).toMatch(/^sent:/);
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

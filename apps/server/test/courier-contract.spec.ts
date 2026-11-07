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
      url: expect.stringMatching(/\/create_order$/) as string,
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

  it('keeps a payment message as news that moves nothing, until a real one shows what it carries (Slice 6.5)', () => {
    const read = adapter.readMessage(
      Buffer.from(JSON.stringify({ notification_type: 'payment_request', amount: 900 })),
      {},
    );
    expect(read).toMatchObject({
      statusEvent: false,
      forShopper: false,
      paid: false,
      payoutId: null,
    });
  });
});

describe('Steadfast’s payouts, as its live list answered on 2026-11-06 (CRR-17, Slice 6.5)', () => {
  it('reads a page of its payouts, oldest first, with its figures and Dhaka’s times', async () => {
    steadfast.reset();
    steadfast.pay('AAA-10000001', [{ consignmentId: 1, invoice: 'A' }], '2026-11-01 15:30:00');
    steadfast.pay('AAA-10000002', [], '2026-11-02 09:00:00', {
      status_label: 'Processing',
      paid_at: null,
    });
    const answer = await adapter.payouts(ACCOUNT, 1);
    expect(steadfast.callsTo('/payments')).toHaveLength(1);
    expect(answer).toEqual({
      outcome: 'found',
      payouts: [
        {
          payoutId: 'AAA-10000001',
          amount: '1840.00',
          charges: '160.00',
          total: '2000.00',
          method: 'Bank',
          paid: true,
          paidAt: new Date('2026-11-01T09:30:00.000Z'),
          madeAt: new Date('2026-11-01T09:30:00.000Z'),
        },
        expect.objectContaining({ payoutId: 'AAA-10000002', paid: false, paidAt: null }),
      ],
    });
    expect(adapter.payoutPageAtLeast).toBe(8);
    await expect(adapter.payouts(ACCOUNT, 2)).resolves.toEqual({ outcome: 'found', payouts: [] });
  });

  it('leaves out a payout with no ID, an ID too long to keep, or no amount it can read', async () => {
    steadfast.reset();
    steadfast.pay('', []);
    steadfast.pay('X'.repeat(65), []);
    steadfast.pay('AAA-3', [], undefined, { amount: 'a lot' as unknown as number });
    steadfast.pay('AAA-4', [], undefined, { amount: 99.5 });
    const answer = await adapter.payouts(ACCOUNT, 1);
    expect(answer.outcome === 'found' ? answer.payouts.map((each) => each.payoutId) : []).toEqual([
      'AAA-4',
    ]);
    expect(answer.outcome === 'found' ? answer.payouts[0]?.amount : null).toBe('99.50');
  });

  it('reads the parcels one payout settled, by its number and ours, and says when there is no such payout', async () => {
    steadfast.reset();
    steadfast.pay('AAA-5', [
      { consignmentId: 1424107, invoice: '261104-0017' },
      { consignmentId: 1424108, invoice: '261104-0018' },
    ]);
    await expect(adapter.payout(ACCOUNT, 'AAA-5')).resolves.toEqual({
      outcome: 'found',
      parcels: [
        { consignmentId: '1424107', invoice: '261104-0017' },
        { consignmentId: '1424108', invoice: '261104-0018' },
      ],
    });
    expect(steadfast.callsTo('/payments/AAA-5')).toHaveLength(1);
    await expect(adapter.payout(ACCOUNT, 'AAA-6')).resolves.toEqual({ outcome: 'not_found' });
  });

  it('reads wrong keys as a refused login, and no answer as no answer', async () => {
    steadfast.reset();
    const bad = { ...ACCOUNT, credentials: { apiKey: 'bad-key', secretKey: 'bad-secret' } };
    await expect(adapter.payouts(bad, 1)).resolves.toMatchObject({
      outcome: 'refused',
      refusal: { login: true },
    });
    steadfast.behaviour = { payoutsTimeOut: true };
    await expect(adapter.payouts(ACCOUNT, 1)).rejects.toThrow('no readable answer');
    await expect(adapter.payout(ACCOUNT, 'AAA-1')).rejects.toThrow('no readable answer');
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

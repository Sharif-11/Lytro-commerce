import { describe, expect, it } from 'vitest';
import { CourierAreaMatch } from '@lytronix/validators';
import type { ZillaView } from '../src/modules/delivery/types/delivery';
import {
  CourierAreaMatcher,
  likeness,
  plainName,
} from '../src/modules/couriers/services/courier-area-matching';
import { RedxAdapter } from '../src/modules/couriers/services/redx-adapter';
import { courierContract } from './support/courier-contract';
import { FakeRedx, REDX_SHOP_TOKEN } from './support/fake-redx';

const redx = new FakeRedx();
const adapter = new RedxAdapter('https://openapi.redx.com.bd/v1.0.0-beta', redx.fetch);
const ACCOUNT = {
  tenantId: 'tenant',
  connectionId: 'connection',
  credentials: { apiToken: REDX_SHOP_TOKEN, storeId: '1' },
};
const BOOKING = {
  invoice: '261106-0017',
  recipientName: 'Rahima Akter',
  recipientPhone: '01711234567',
  recipientAddress: 'House 12, Road 3, Mirpur, Dhaka',
  cod: '370.50',
  note: null,
  weightKg: '1.250',
  areaCode: '1',
  areaName: 'Mirpur 10',
  quantity: '1.000',
  goodsValue: '310.50',
};

function messageBody(status: string, extra: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      tracking_number: '21A001REDX',
      timestamp: '2026-11-06T10:00:00.000Z',
      status,
      message_en: 'Your parcel is on its way.',
      message_bn: 'আপনার পার্সেল পথে আছে।',
      invoice_number: '261106-0017',
      delivery_type: 'regular',
      ...extra,
    }),
  );
}

function withAreas(): void {
  redx.areas = [
    {
      id: 1,
      name: 'Mirpur 10',
      post_code: 1216,
      district_name: 'Dhaka',
      division_name: 'Dhaka',
      zone_id: 1,
    },
  ];
}

courierContract('RedX', () => ({
  adapter,
  account: ACCOUNT,
  badAccount: { ...ACCOUNT, credentials: { apiToken: 'not-a-token' } },
  booking: BOOKING,
  secrets: [REDX_SHOP_TOKEN, 'not-a-token'],
  reset: () => {
    redx.reset();
    withAreas();
  },
  parcels: () => redx.parcels.length,
  nextBookingRefused: (words) => {
    redx.behaviour = {
      refuseBooking: {
        status: 400,
        body: {
          message: 'Request payload contains validation errors',
          validation_errors: [{ customer_address: words }],
        },
      },
    };
  },
  nextBookingLost: () => {
    redx.behaviour = { bookingTimesOut: { madeIt: true } };
  },
  nextBookingPage: () => {
    redx.behaviour = { bookingPage: true };
  },
  messageToken: 'the-token-in-the-address',
  message: (status) => ({ rawBody: messageBody(status), headers: {}, good: {} }),
  strangeStatus: 'teleported',
  deliveredStatus: 'delivered',
  unconfirmedStatus: null,
  proof: 'address',
  parcelStandsAt: (status) => {
    for (const each of redx.parcels) each.status = status;
  },
}));

describe('RedX, as its document says and its sandbox showed (Appendix A)', () => {
  it('sends its area, weight in grams, the goods as the declared value, and its store', async () => {
    redx.reset();
    withAreas();
    await adapter.book(ACCOUNT, { ...BOOKING, note: 'Fragile' });
    expect(redx.bookings()[0]?.body).toEqual({
      customer_name: 'Rahima Akter',
      customer_phone: '01711234567',
      delivery_area: 'Mirpur 10',
      delivery_area_id: 1,
      customer_address: 'House 12, Road 3, Mirpur, Dhaka',
      merchant_invoice_id: '261106-0017',
      cash_collection_amount: '370.50',
      parcel_weight: 1250,
      value: 310.5,
      instruction: 'Fragile',
      pickup_store_id: 1,
    });
  });

  it('sends no store when none was chosen, so its own default is used', async () => {
    redx.reset();
    withAreas();
    await adapter.book({ ...ACCOUNT, credentials: { apiToken: REDX_SHOP_TOKEN } }, BOOKING);
    expect(redx.bookings()[0]?.body).not.toHaveProperty('pickup_store_id');
    expect(adapter.storeOptional).toBe(true);
  });

  it('reads a refusal from its first validation error', async () => {
    redx.reset();
    withAreas();
    await expect(adapter.book(ACCOUNT, { ...BOOKING, areaCode: '999' })).resolves.toEqual({
      outcome: 'refused',
      refusal: { message: 'Not a valid delivery_area_id provided for delivery!', login: false },
    });
  });

  it('reads a part delivery from how it was delivered, and never a cash amount', async () => {
    redx.reset();
    withAreas();
    const answer = await adapter.book(ACCOUNT, BOOKING);
    if (answer.outcome !== 'accepted') throw new Error('it should have booked');
    const parcel = redx.parcels[0];
    if (!parcel) throw new Error('no parcel');
    parcel.status = 'delivered';
    parcel.deliveryType = 'partial-delivery';
    await expect(
      adapter.track(ACCOUNT, {
        consignmentId: answer.parcel.consignmentId,
        invoice: BOOKING.invoice,
      }),
    ).resolves.toMatchObject({
      outcome: 'found',
      news: {
        rawStatus: 'delivered',
        reading: 'partly_delivered',
        cashCollected: null,
        deliveryCharge: '60',
      },
    });
    expect(
      adapter.readMessage(messageBody('delivered', { delivery_type: 'partial-delivery' })),
    ).toMatchObject({ reading: 'partly_delivered', cashCollected: null });
  });

  it.each([
    ['pickup-pending', 'booked'],
    ['ready-for-delivery', 'with_courier'],
    ['delivery-in-progress', 'with_courier'],
    ['delivered', 'delivered'],
    ['agent-hold', 'hold'],
    ['agent-area-change', 'hold'],
    ['agent-returning', 'returning'],
    ['returned', 'returning'],
  ])('reads %s as %s', (status, reading) => {
    expect(adapter.readMessage(messageBody(status))).toMatchObject({ statusEvent: true, reading });
  });

  it('keeps both languages, for the shopper too, and shows being paid without moving anything', () => {
    expect(adapter.readMessage(messageBody('delivery-in-progress'))).toMatchObject({
      messageEn: 'Your parcel is on its way.',
      messageBn: 'আপনার পার্সেল পথে আছে।',
      forShopper: true,
      consignmentId: '21A001REDX',
      invoice: '261106-0017',
    });
    expect(adapter.readMessage(messageBody('paid'))).toMatchObject({
      statusEvent: false,
      forShopper: false,
      reading: null,
      rawStatus: null,
      // CRR-12, CRR-17 (Slice 6.5): being paid, with no amount and no payout named.
      paid: true,
      payoutId: null,
    });
    expect(adapter.readMessage(messageBody('delivered'))).toMatchObject({ paid: false });
  });

  it('gives a step one key, and a new one when the same step comes again later', () => {
    const first = adapter.readMessage(messageBody('agent-hold'));
    expect(adapter.readMessage(messageBody('agent-hold'))?.dedupeKey).toBe(first?.dedupeKey);
    expect(
      adapter.readMessage(messageBody('agent-hold', { timestamp: '2026-11-07T09:00:00.000Z' }))
        ?.dedupeKey,
    ).not.toBe(first?.dedupeKey);
  });

  it('cancels only on a clear success: a 503 saying success, as its sandbox did, is no answer', async () => {
    redx.reset();
    withAreas();
    const answer = await adapter.book(ACCOUNT, BOOKING);
    if (answer.outcome !== 'accepted') throw new Error('it should have booked');
    const id = answer.parcel.consignmentId;
    await expect(adapter.cancel(ACCOUNT, id)).resolves.toEqual({ outcome: 'cancelled' });
    expect(redx.cancels()[0]?.body).toEqual({
      entity_type: 'parcel-tracking-id',
      entity_id: id,
      update_details: {
        property_name: 'status',
        new_value: 'cancelled',
        reason: 'Cancelled by the shop',
      },
    });
    redx.behaviour = { cancel: 'sandbox' };
    await expect(adapter.cancel(ACCOUNT, id)).rejects.toThrow('no readable answer');
    redx.behaviour = { cancel: 'unclear' };
    await expect(adapter.cancel(ACCOUNT, id)).rejects.toThrow('no readable answer');
    redx.behaviour = { cancel: 'refused' };
    await expect(adapter.cancel(ACCOUNT, id)).resolves.toEqual({
      outcome: 'refused',
      refusal: { message: 'Parcel can not be cancelled now', login: false },
    });
  });

  it('reads its area list and its stores', async () => {
    redx.reset();
    withAreas();
    await expect(adapter.listAreas(ACCOUNT)).resolves.toEqual({
      outcome: 'found',
      areas: [{ areaCode: '1', name: 'Mirpur 10', districtName: 'Dhaka', postCode: '1216' }],
    });
    await expect(adapter.pickupStores(ACCOUNT)).resolves.toEqual({
      outcome: 'found',
      stores: [{ id: '1', name: 'Malibag', address: 'Malibagh main road', active: true }],
    });
  });
});

const ZILLAS: ZillaView[] = [
  {
    id: 1,
    nameEn: 'Dhaka',
    nameBn: 'ঢাকা',
    thanas: [
      { id: 11, nameEn: 'Mirpur', nameBn: 'মিরপুর', cityCode: 'dhaka' },
      { id: 12, nameEn: 'Pallabi', nameBn: 'পল্লবী', cityCode: 'dhaka' },
      { id: 13, nameEn: 'Banani', nameBn: 'বনানী', cityCode: 'dhaka' },
      { id: 14, nameEn: 'Hazaribagh', nameBn: 'হাজারীবাগ', cityCode: 'dhaka' },
      { id: 15, nameEn: 'Keraniganj', nameBn: 'কেরানীগঞ্জ', cityCode: null },
      { id: 16, nameEn: 'Kamrangirchar', nameBn: 'কামরাঙ্গীরচর', cityCode: 'dhaka' },
    ],
  },
  {
    id: 2,
    nameEn: 'Chattogram',
    nameBn: 'চট্টগ্রাম',
    thanas: [{ id: 21, nameEn: 'Raozan', nameBn: 'রাউজান', cityCode: null }],
  },
];

describe('matching RedX areas to thanas, on names from its live list (read agreed 2026-11-06)', () => {
  const matcher = new CourierAreaMatcher(ZILLAS);
  const place = (name: string, districtName = 'Dhaka') => matcher.place({ name, districtName });

  it.each([
    ['Mirpur', 11],
    ['Mirpur 10', 11],
    ['Mirpur DOHS', 11],
    ['Banani', 13],
    ['Keranigonj(Dhaka)', 15],
    ['Hazaribag(Dhaka)', 14],
  ])('counts %s in its own thana', (name, thanaId) => {
    expect(place(name)).toEqual({
      zillaId: 1,
      thanaId,
      suggestedThanaId: null,
      match: CourierAreaMatch.OwnName,
    });
  });

  it.each([
    ['Kakoli(Banani)', 13],
    ['Matikata(Mirpur)', 11],
    ['Duaripara-Pallabi(Mirpur 12)', 11],
    ['Kamrangichar(Dhaka)', 16],
  ])('only suggests %s, named in brackets or nearly spelled', (name, suggestedThanaId) => {
    expect(place(name)).toEqual({
      zillaId: 1,
      thanaId: null,
      suggestedThanaId,
      match: CourierAreaMatch.Suggested,
    });
  });

  it('leaves an area with no thana of its name for the operator, still in its zilla', () => {
    expect(place('Shyamoli(Dhaka)')).toEqual({
      zillaId: 1,
      thanaId: null,
      suggestedThanaId: null,
      match: CourierAreaMatch.None,
    });
  });

  it('finds a district written the older way', () => {
    expect(place('Raozan', 'Chittagong')).toMatchObject({ zillaId: 2, thanaId: 21 });
  });

  it('finds no zilla for a district it doesn’t know, and matches nothing there', () => {
    expect(place('Mirpur', 'Atlantis')).toEqual({
      zillaId: null,
      thanaId: null,
      suggestedThanaId: null,
      match: CourierAreaMatch.None,
    });
  });

  it('compares names without brackets, numbers or kind words', () => {
    expect(plainName('Bogra Sadar (Town) 12')).toBe('bogra');
    expect(likeness('kamrangichar', 'kamrangirchar')).toBeGreaterThan(0.88);
    expect(likeness('mirpur', 'pallabi')).toBeLessThan(0.5);
  });
});

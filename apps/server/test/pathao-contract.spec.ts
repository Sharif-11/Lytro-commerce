import { describe, expect, it } from 'vitest';
import { PathaoAdapter } from '../src/modules/couriers/services/pathao-adapter';
import { courierContract } from './support/courier-contract';
import { FakePathao, PATHAO_FIELDS, PATHAO_PASSWORD } from './support/fake-pathao';

const MESSAGE_TOKEN = 'the-secret-the-owner-pasted';
const ANSWER_VALUE = 'the-value-its-page-says-to-answer-with';
const NOW = new Date('2026-11-05T12:00:00.000Z');
const pathao = new FakePathao();
const adapter = new PathaoAdapter(
  'https://courier-api-sandbox.pathao.com/aladdin/api/v1',
  pathao.fetch,
  () => NOW,
  ANSWER_VALUE,
);

function account() {
  const { accessToken, refreshToken } = pathao.grant();
  return {
    tenantId: 'tenant',
    connectionId: 'connection',
    credentials: {
      clientId: PATHAO_FIELDS.clientId,
      clientSecret: PATHAO_FIELDS.clientSecret,
      accessToken,
      refreshToken,
      expiresAt: '2027-01-01T00:00:00.000Z',
      storeId: '2',
      storeName: 'Mirpur warehouse',
    },
  };
}

const BOOKING = {
  invoice: '261105-0017',
  recipientName: 'Rahima Akter',
  recipientPhone: '01711234567',
  recipientAddress: 'House 12, Road 3, Mirpur, Dhaka',
  cod: '370.00',
  note: null,
  weightKg: '1.000',
  areaCode: null,
  quantity: '1.000',
};

function messageBody(event: string, extra: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      consignment_id: 'DS0511P1',
      merchant_order_id: '261105-0017',
      updated_at: '2026-11-05 21:35:09',
      timestamp: '2026-11-05T15:35:09+00:00',
      store_id: 2,
      event,
      delivery_fee: 60,
      ...extra,
    }),
  );
}

courierContract('Pathao', () => {
  const working = { ...account() };
  return {
    adapter,
    get account() {
      // Each case resets the fake, which ends every token, so each read gets a working one.
      return account();
    },
    badAccount: {
      ...working,
      credentials: { ...working.credentials, accessToken: 'not-a-token' },
    },
    booking: BOOKING,
    secrets: [PATHAO_FIELDS.clientSecret, PATHAO_PASSWORD, 'not-a-token'],
    reset: () => {
      pathao.reset();
    },
    parcels: () => pathao.parcels.length,
    nextBookingRefused: (words) => {
      pathao.behaviour = {
        refuseBooking: {
          status: 422,
          body: {
            message: 'Please fix the given errors',
            type: 'error',
            code: 422,
            errors: { recipient_address: [words] },
          },
        },
      };
    },
    nextBookingLost: () => {
      pathao.behaviour = { bookingTimesOut: { madeIt: true } };
    },
    nextBookingPage: () => {
      pathao.behaviour = { bookingPage: true };
    },
    messageToken: MESSAGE_TOKEN,
    message: (status) => ({
      rawBody: messageBody(`order.${status}`),
      headers: {},
      good: { 'x-pathao-signature': MESSAGE_TOKEN },
    }),
    strangeStatus: 'teleported',
    deliveredStatus: 'delivered',
    unconfirmedStatus: null,
    proofCoversBody: false,
    parcelStandsAt: (status) => {
      for (const each of pathao.parcels) pathao.statuses.set(each.consignmentId, status);
    },
  };
});

describe('Pathao, as its sandbox answered on 2026-11-05', () => {
  it('sends what it takes, with whole numbers and a store', async () => {
    pathao.reset();
    await adapter.book(account(), {
      ...BOOKING,
      cod: '500.00',
      note: 'Fragile',
      weightKg: '2.500',
      quantity: '1.500',
    });
    expect(pathao.bookings()[0]?.body).toEqual({
      store_id: 2,
      merchant_order_id: '261105-0017',
      recipient_name: 'Rahima Akter',
      recipient_phone: '01711234567',
      recipient_address: 'House 12, Road 3, Mirpur, Dhaka',
      delivery_type: 48,
      item_type: 2,
      item_quantity: 2,
      item_weight: 2.5,
      amount_to_collect: 500,
      special_instruction: 'Fragile',
    });
  });

  it('sends a parcel lighter than half a kilo as half a kilo, and at least one item', async () => {
    pathao.reset();
    await adapter.book(account(), { ...BOOKING, weightKg: '0.200', quantity: '0.250' });
    expect(pathao.bookings()[0]?.body).toMatchObject({ item_weight: 0.5, item_quantity: 1 });
  });

  it('leaves out a note it was not given', async () => {
    pathao.reset();
    await adapter.book(account(), BOOKING);
    expect(pathao.bookings()[0]?.body).not.toHaveProperty('special_instruction');
  });

  it('keeps the tokens from a login and never the password', async () => {
    pathao.reset();
    const answer = await adapter.logIn(PATHAO_FIELDS);
    expect(answer.outcome).toBe('accepted');
    if (answer.outcome !== 'accepted') return;
    expect(Object.keys(answer.credentials).sort()).toEqual([
      'accessToken',
      'clientId',
      'clientSecret',
      'expiresAt',
      'refreshToken',
    ]);
    expect(JSON.stringify(answer)).not.toContain(PATHAO_PASSWORD);
    expect(JSON.stringify(answer)).not.toContain(PATHAO_FIELDS.username);
    expect(answer.credentials['expiresAt']).toBe('2027-02-03T12:00:00.000Z');
  });

  it('reads a wrong login as a refused login, in its words', async () => {
    pathao.reset();
    await expect(adapter.logIn({ ...PATHAO_FIELDS, password: 'wrong' })).resolves.toEqual({
      outcome: 'refused',
      refusal: { message: 'The user credentials were incorrect', login: true },
    });
  });

  it('says no answer when a login gets none, rather than calling it refused', async () => {
    pathao.reset();
    pathao.behaviour = { down: true };
    await expect(adapter.logIn(PATHAO_FIELDS)).rejects.toThrow('no readable answer');
  });

  it.each([
    ['a server error', { status: 500, body: { message: 'Server Error' } }],
    ['a success with no tokens', { status: 200, body: { message: 'Done' } }],
  ])('says no answer when a login gets %s', async (_name, issueAnswer) => {
    pathao.reset();
    pathao.behaviour = { issueAnswer };
    await expect(adapter.logIn(PATHAO_FIELDS)).rejects.toThrow('no readable answer');
  });

  it('renews with no password, keeps the store, and the old pair stops working', async () => {
    pathao.reset();
    const old = account();
    const answer = await adapter.renewLogin(old);
    expect(answer.outcome).toBe('accepted');
    if (answer.outcome !== 'accepted') return;
    expect(pathao.refreshes()[0]?.body).not.toHaveProperty('password');
    expect(answer.credentials['storeId']).toBe('2');
    expect(answer.credentials['refreshToken']).not.toBe(old.credentials.refreshToken);
    await expect(adapter.testConnection(old)).resolves.toMatchObject({
      outcome: 'refused',
      refusal: { login: true },
    });
    await expect(adapter.renewLogin(old)).resolves.toMatchObject({
      outcome: 'refused',
      refusal: { login: true },
    });
  });

  it('wants renewing a day before the token ends, or when it can’t tell', () => {
    const due = (expiresAt: string) => adapter.renewalDue({ expiresAt }, NOW);
    expect(due('2026-11-07T12:00:00.000Z')).toBe(false);
    expect(due('2026-11-06T11:00:00.000Z')).toBe(true);
    expect(due('2026-11-01T00:00:00.000Z')).toBe(true);
    expect(adapter.renewalDue({}, NOW)).toBe(true);
  });

  it('lists its stores, telling active from not', async () => {
    pathao.reset();
    pathao.stores.push({
      store_id: 9,
      store_name: 'Old shop',
      store_address: 'Agrabad',
      is_active: 0,
    });
    await expect(adapter.pickupStores(account())).resolves.toEqual({
      outcome: 'found',
      stores: [
        { id: '2', name: 'Mirpur warehouse', address: 'House 1, Mirpur, Dhaka', active: true },
        { id: '9', name: 'Old shop', address: 'Agrabad', active: false },
      ],
    });
  });

  it('takes its charge from a booking’s answer and writes its status as it reads them', async () => {
    pathao.reset();
    await expect(adapter.book(account(), BOOKING)).resolves.toMatchObject({
      outcome: 'accepted',
      parcel: { trackingCode: null, courierStatus: 'pending', deliveryCharge: '60' },
    });
  });

  it('reads a repeat of our number as a second parcel, which is why a lost answer goes to staff', async () => {
    pathao.reset();
    const working = account();
    await adapter.book(working, BOOKING);
    await adapter.book(working, BOOKING);
    expect(pathao.parcels).toHaveLength(2);
    expect('lookUp' in adapter).toBe(false);
    expect('cancel' in adapter).toBe(false);
  });

  it('reads a refusal from its first field error, not its general message', async () => {
    pathao.reset();
    const answer = await adapter.book(
      { ...account(), credentials: { ...account().credentials, storeId: '999' } },
      BOOKING,
    );
    expect(answer).toEqual({
      outcome: 'refused',
      refusal: { message: 'Wrong Store selected', login: false },
    });
  });

  it('says not found for a parcel it doesn’t know or one with no number, and asks nothing for the latter', async () => {
    pathao.reset();
    const working = account();
    await expect(
      adapter.track(working, { consignmentId: 'DSNOSUCH', invoice: 'x' }),
    ).resolves.toEqual({ outcome: 'not_found' });
    expect(pathao.statusCalls()).toHaveLength(1);
    await expect(adapter.track(working, { consignmentId: null, invoice: 'x' })).resolves.toEqual({
      outcome: 'not_found',
    });
    expect(pathao.statusCalls()).toHaveLength(1);
  });

  it('reads its status call’s slugs and its messages’ events as one status', async () => {
    pathao.reset();
    const working = account();
    const booked = await adapter.book(working, BOOKING);
    if (booked.outcome !== 'accepted') throw new Error('it should have booked');
    pathao.statuses.set(booked.parcel.consignmentId, 'At_the_Sorting_HUB');
    const asked = await adapter.track(working, {
      consignmentId: booked.parcel.consignmentId,
      invoice: BOOKING.invoice,
    });
    expect(asked).toMatchObject({
      outcome: 'found',
      news: {
        rawStatus: 'at_the_sorting_hub',
        reading: 'with_courier',
        happenedAt: new Date('2026-11-05T15:35:09.000Z'),
      },
    });
    expect(adapter.readMessage(messageBody('order.at-the-sorting-hub'))).toMatchObject({
      rawStatus: 'at_the_sorting_hub',
      reading: 'with_courier',
    });
  });

  it.each([
    ['order.created', 'booked'],
    ['order.pickup-requested', 'booked'],
    ['order.assigned-for-pickup', 'booked'],
    ['order.picked', 'with_courier'],
    ['order.in-transit', 'with_courier'],
    ['order.received-at-last-mile-hub', 'with_courier'],
    ['order.assigned-for-delivery', 'with_courier'],
    ['order.pickup-failed', 'hold'],
    ['order.on-hold', 'hold'],
    ['order.delivery-failed', 'hold'],
    ['order.pickup-cancelled', 'problem'],
    ['order.delivered', 'delivered'],
    ['order.partial-delivery', 'partly_delivered'],
    ['order.returned', 'returning'],
    ['order.paid-return', 'returning'],
  ])('reads %s as %s', (event, reading) => {
    expect(adapter.readMessage(messageBody(event))).toMatchObject({ statusEvent: true, reading });
  });

  it.each(['order.updated', 'order.paid', 'order.return-id-created', 'store.created'])(
    'shows %s and moves nothing',
    (event) => {
      expect(adapter.readMessage(messageBody(event))).toMatchObject({
        statusEvent: false,
        reading: null,
        rawStatus: null,
      });
    },
  );

  it('takes the cash only on a result, with its charge and our number', () => {
    expect(
      adapter.readMessage(messageBody('order.delivered', { collected_amount: 500 })),
    ).toMatchObject({
      cashCollected: '500',
      deliveryCharge: '60',
      invoice: '261105-0017',
      consignmentId: 'DS0511P1',
    });
    expect(
      adapter.readMessage(messageBody('order.in-transit', { collected_amount: 500 }))
        ?.cashCollected,
    ).toBeNull();
  });

  it('works out one key per step, and a new one when the same step happens again', () => {
    const first = adapter.readMessage(messageBody('order.on-hold'));
    expect(adapter.readMessage(messageBody('order.on-hold'))?.dedupeKey).toBe(first?.dedupeKey);
    expect(
      adapter.readMessage(messageBody('order.on-hold', { updated_at: '2026-11-06 09:00:00' }))
        ?.dedupeKey,
    ).not.toBe(first?.dedupeKey);
  });

  it('knows its test of an address, and nothing else is one', () => {
    expect(adapter.isAddressTest(Buffer.from('{"event":"webhook_integration"}'))).toBe(true);
    expect(adapter.isAddressTest(messageBody('order.delivered'))).toBe(false);
    expect(adapter.isAddressTest(Buffer.from('<html>'))).toBe(false);
  });

  it('answers with the value its page asks for, and without one if none is set', () => {
    expect(adapter.messageAnswerHeaders()).toEqual({
      'X-Pathao-Merchant-Webhook-Integration-Secret': ANSWER_VALUE,
    });
    const without = new PathaoAdapter('https://x.test', pathao.fetch, () => NOW, null);
    expect(without.messageAnswerHeaders()).toEqual({});
  });
});

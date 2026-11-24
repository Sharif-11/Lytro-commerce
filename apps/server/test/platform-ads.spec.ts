import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@lytronix/db';
import { QueueName } from '@lytronix/validators';
import type { PlatformAdStore } from '../src/modules/platform-ads/ports/platform-ad-store';
import { AdVisitReader } from '../src/modules/platform-ads/services/ad-visit-reader';
import { platformEventOf } from '../src/modules/platform-ads/services/platform-ad-event';
import { PlatformAdEvents } from '../src/modules/platform-ads/services/platform-ad-events';
import { PlatformAdSender } from '../src/modules/platform-ads/services/platform-ad-sender';
import { PlatformAdSettings } from '../src/modules/platform-ads/services/platform-ad-settings';
import {
  type AdVisit,
  PlatformAdEvent,
  type PlatformAdJob,
} from '../src/modules/platform-ads/types/platform-ad';
import type {
  MetaConversions,
  MetaSendOptions,
  MetaServerEvent,
} from '../src/modules/shared/meta-conversions/ports/meta-conversions';
import type { JobQueue } from '../src/modules/shared/queue/ports/job-queue';

// MKT-01 to MKT-06 (the owner, 2026-11-24): Lytro's own sign-up, shop and plan events for its Meta pixel -- queued with
// what they are about, at most once a shop where they must be, never failing it, and sent as Meta's Conversions API
// takes them.
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const ON = new PlatformAdSettings({
  LYTRO_META_PIXEL_ID: '1234567890',
  LYTRO_META_CAPI_TOKEN: 'the-token',
});
const OFF = new PlatformAdSettings({});
const VISIT: AdVisit = {
  ip: '103.4.5.6',
  userAgent: 'Mozilla/5.0',
  fbp: 'fb.1.1700000000000.1234567890',
  fbc: 'fb.1.1700000000000.IwAR2abc',
  pageUrl: 'https://app.lytro.app/verify-code',
};

/** A transaction whose savepoint runs its work in place, as Postgres would. */
const tx = {
  transaction: (work: (point: unknown) => Promise<unknown>) => work(tx),
} as unknown as Transaction;

function eventsWith(settings: PlatformAdSettings, claimed: boolean[] = []) {
  const queued: { name: QueueName; payload: PlatformAdJob; key?: string }[] = [];
  const jobs: JobQueue = {
    enqueue: (_tx, name, payload, options) => {
      queued.push({ name, payload: payload as PlatformAdJob, key: options?.singletonKey });
      return Promise.resolve();
    },
  };
  const claims: string[] = [];
  const store: PlatformAdStore = {
    claim: (_tx, tenantId, event) => {
      claims.push(`${event}:${tenantId}`);
      return Promise.resolve(claimed.shift() ?? true);
    },
    ownerPhoneOf: () => Promise.resolve(null),
  };
  return { events: new PlatformAdEvents(settings, jobs, store), queued, claims };
}

describe("queuing Lytro's own events (MKT-02, MKT-04, MKT-06)", () => {
  it('queues a sign-up as Lead, its phone and account hashed and its visit kept', async () => {
    const { events, queued } = eventsWith(ON);
    await events.signedUpWithin(tx, { subscriberId: 'sub-1', phone: '01712345678', visit: VISIT });

    expect(queued).toEqual([
      {
        name: QueueName.PlatformAdEvent,
        key: undefined,
        payload: expect.objectContaining({
          event: PlatformAdEvent.Lead,
          eventId: 'lead-sub-1',
          hashedPhone: sha('8801712345678'),
          hashedExternalId: sha('sub-1'),
          visit: VISIT,
        }) as unknown,
      },
    ]);
    expect(JSON.stringify(queued)).not.toContain('01712345678');
  });

  it('queues nothing at all without both the pixel and its token (staging, development)', async () => {
    const { events, queued, claims } = eventsWith(OFF);
    await events.signedUpWithin(tx, { subscriberId: 'sub-1', phone: '01712345678', visit: null });
    await events.orderMadeWithin(tx, 'shop-1');
    expect(queued).toEqual([]);
    expect(claims).toEqual([]);
  });

  it("tells of a shop's activation and first plan once, and stops asking once the database says it was", async () => {
    const { events, queued, claims } = eventsWith(ON, [true, false]);
    await events.orderMadeWithin(tx, 'shop-1');
    await events.orderMadeWithin(tx, 'shop-1');
    await events.orderMadeWithin(tx, 'shop-1');
    await events.planPaidWithin(tx, 'shop-1', '349.00');

    expect(queued.map((job) => job.payload.event)).toEqual([
      PlatformAdEvent.ShopActivated,
      PlatformAdEvent.Subscribe,
    ]);
    expect(queued[1]?.payload).toMatchObject({ eventId: 'subscribe-shop-1', value: '349.00' });
    // The third order never reaches the database: the second's claim found the row.
    expect(claims).toEqual(['ShopActivated:shop-1', 'ShopActivated:shop-1', 'Subscribe:shop-1']);
  });

  it('never fails what it tells of when queuing fails', async () => {
    const failing = new PlatformAdEvents(
      ON,
      { enqueue: () => Promise.reject(new Error('the queue is away')) },
      { claim: () => Promise.resolve(true), ownerPhoneOf: () => Promise.resolve(null) },
    );
    await expect(failing.orderMadeWithin(tx, 'shop-1')).resolves.toBeUndefined();
    await expect(
      failing.shopCreatedWithin(tx, {
        tenantId: 'shop-1',
        subscriberId: 'sub-1',
        phone: '01712345678',
        visit: null,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('the visit an event is matched by (MKT-03)', () => {
  const reader = new AdVisitReader();

  it("keeps Meta's cookies, the browser and the page without its query", () => {
    const visit = reader.read(
      {
        headers: {
          cookie:
            'lytro_session=x; _fbp=fb.1.1700000000000.1234567890; _fbc=fb.1.1700000000000.IwAR2abc',
          referer: 'https://app.lytro.app/verify-code?phone=01712345678',
        },
      },
      { ip: '103.4.5.6', userAgent: 'Mozilla/5.0' },
    );
    expect(visit).toEqual(VISIT);
  });

  it("leaves out a cookie not in Meta's form, a page that is no web address, and an overlong browser", () => {
    const visit = reader.read(
      { headers: { cookie: '_fbp=hello; _fbc=fb.1.17.x;y', referer: 'javascript:alert(1)' } },
      { ip: null, userAgent: 'x'.repeat(2000) },
    );
    expect(visit).toMatchObject({ fbp: null, fbc: null, pageUrl: null, ip: null });
    expect(visit.userAgent).toHaveLength(512);
  });
});

describe('an event as Meta takes it (MKT-02, MKT-03)', () => {
  const job = (over: Partial<PlatformAdJob>): PlatformAdJob => ({
    event: PlatformAdEvent.Lead,
    eventId: 'lead-sub-1',
    eventTime: 1795400000,
    tenantId: null,
    hashedPhone: sha('8801712345678'),
    hashedExternalId: sha('sub-1'),
    visit: VISIT,
    value: null,
    ...over,
  });

  it('a sign-up is a website event with the page, the browser, the address and the cookies', () => {
    expect(platformEventOf(job({}), null)).toEqual({
      event_name: 'Lead',
      event_time: 1795400000,
      event_id: 'lead-sub-1',
      action_source: 'website',
      event_source_url: 'https://app.lytro.app/verify-code',
      user_data: {
        ph: [sha('8801712345678')],
        external_id: [sha('sub-1')],
        client_ip_address: '103.4.5.6',
        client_user_agent: 'Mozilla/5.0',
        fbp: 'fb.1.1700000000000.1234567890',
        fbc: 'fb.1.1700000000000.IwAR2abc',
      },
    });
  });

  it("a shop's first plan is the server's own event, told of by the owner's phone, with its amount", () => {
    const event = platformEventOf(
      job({
        event: PlatformAdEvent.Subscribe,
        eventId: 'subscribe-shop-1',
        tenantId: 'shop-1',
        hashedPhone: null,
        hashedExternalId: null,
        visit: null,
        value: '349.00',
      }),
      '01811111111',
    );
    expect(event).toEqual({
      event_name: 'Subscribe',
      event_time: 1795400000,
      event_id: 'subscribe-shop-1',
      action_source: 'system_generated',
      user_data: { ph: [sha('8801811111111')] },
      custom_data: { currency: 'BDT', value: 349 },
    });
  });
});

describe("sending to Lytro's pixel (MKT-02, MKT-05)", () => {
  function senderWith(settings: PlatformAdSettings, meta: MetaConversions) {
    const store: PlatformAdStore = {
      claim: () => Promise.resolve(true),
      ownerPhoneOf: () => Promise.resolve('01811111111'),
    };
    return new PlatformAdSender(settings, store, meta);
  }
  const activation: PlatformAdJob = {
    event: PlatformAdEvent.ShopActivated,
    eventId: 'activated-shop-1',
    eventTime: 1795400000,
    tenantId: 'shop-1',
    hashedPhone: null,
    hashedExternalId: null,
    visit: null,
    value: null,
  };

  it("sends with Lytro's pixel and token, and to Test events while a test code is set", async () => {
    const sent: {
      pixel: string;
      token: string;
      events: MetaServerEvent[];
      options?: MetaSendOptions;
    }[] = [];
    const meta: MetaConversions = {
      send: (pixel, token, events, options) => {
        sent.push({ pixel, token, events, options });
        return Promise.resolve();
      },
    };
    const testing = new PlatformAdSettings({
      LYTRO_META_PIXEL_ID: '1234567890',
      LYTRO_META_CAPI_TOKEN: 'the-token',
      LYTRO_META_TEST_EVENT_CODE: 'TEST123',
    });
    await senderWith(testing, meta).send(activation);

    expect(sent).toEqual([
      {
        pixel: '1234567890',
        token: 'the-token',
        events: [
          expect.objectContaining({
            event_name: 'ShopActivated',
            user_data: { ph: [sha('8801811111111')] },
          }),
        ],
        options: { testEventCode: 'TEST123' },
      },
    ]);
  });

  it('sends nothing once the settings are gone, and throws a failure so the job tries again', async () => {
    const send = vi.fn(() => Promise.reject(new Error('Meta answered 500 for pixel 1234567890')));
    await senderWith(OFF, { send }).send(activation);
    expect(send).not.toHaveBeenCalled();
    await expect(senderWith(ON, { send }).send(activation)).rejects.toThrow('Meta answered 500');
  });
});

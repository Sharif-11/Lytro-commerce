import * as Sentry from '@sentry/browser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorTracking } from '../src/lib/error-tracking';

// OBS-03, LOG-02 (Slice 9.6): what the dashboard sends Sentry, through Sentry's own client, to a sender kept here
// instead of the network: the release, the server and the shop; the words redacted; at most 10 from one page load.
interface SentEvent {
  release?: string;
  environment?: string;
  tags?: Record<string, string>;
  exception?: { values?: { value?: string }[] };
  request?: { url?: string };
}

type Envelope = Parameters<ReturnType<NonNullable<Sentry.BrowserOptions['transport']>>['send']>[0];

const envelopes: Envelope[] = [];
let path = '/megh/orders';

const sentEvents = (): SentEvent[] =>
  envelopes.flatMap((envelope) =>
    envelope[1].filter((item) => item[0].type === 'event').map((item) => item[1] as SentEvent),
  );

const tracking = new ErrorTracking(
  { sentryDsn: 'https://public@sentry.example/2', release: '854f8a0b', environment: 'staging' },
  () => path,
  () => ({
    send: (envelope) => {
      envelopes.push(envelope);
      return Promise.resolve({});
    },
    flush: () => Promise.resolve(true),
  }),
);

beforeAll(() => {
  tracking.start();
});

afterAll(async () => {
  await Sentry.close(2_000);
});

describe("the dashboard's error tracking (Slice 9.6)", () => {
  it('sends an error with its release, server and shop, its words redacted', async () => {
    tracking.capture(new Error('order for 01712345678 failed, otp=482913'));
    await Sentry.flush(2_000);
    const event = sentEvents().at(-1);
    expect(event).toMatchObject({
      release: '854f8a0b',
      environment: 'staging',
      tags: { shop: 'megh' },
    });
    expect(event?.exception?.values?.[0]?.value).toBe('order for *******5678 failed, otp=[masked]');
  });

  it("names no shop on the dashboard's own pages", async () => {
    path = '/sign-in';
    tracking.capture(new Error('on sign-in'));
    await Sentry.flush(2_000);
    expect(sentEvents().at(-1)?.tags?.['shop']).toBeUndefined();
    path = '/megh/orders';
  });

  it('sends at most 10 errors from one page load', async () => {
    for (let count = 0; count < 15; count += 1) {
      const error = new Error(`fault ${String(count)}`);
      tracking.capture(error);
    }
    await Sentry.flush(2_000);
    expect(sentEvents()).toHaveLength(10);
  });

  it('starts nothing without a Sentry address', () => {
    const off = new ErrorTracking({
      sentryDsn: null,
      release: 'local',
      environment: 'development',
    });
    off.start();
    const before = envelopes.length;
    off.capture(new Error('not sent'));
    expect(envelopes.length).toBe(before);
  });
});

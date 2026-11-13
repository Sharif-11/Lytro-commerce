import * as Sentry from '@sentry/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorTracker } from '../src/common/error-tracking/error-tracker';
import { RequestErrors } from '../src/common/request-id/request-errors';

// OBS-03, LOG-02 (Slice 9.6): what the server sends Sentry, through Sentry's own client, to a sender kept here instead of
// the network: the release, request, shop, route and job; the words redacted; one noisy error at most 10 times an hour.
interface SentEvent {
  release?: string;
  environment?: string;
  tags?: Record<string, string>;
  exception?: { values?: { type?: string; value?: string }[] };
  request?: unknown;
}

// An envelope as Sentry's transport is handed one.
type Envelope = Parameters<ReturnType<NonNullable<Sentry.NodeOptions['transport']>>['send']>[0];

const envelopes: Envelope[] = [];
let tracker: ErrorTracker;

function sentEvents(): SentEvent[] {
  return envelopes.flatMap((envelope) =>
    envelope[1].filter((item) => item[0].type === 'event').map((item) => item[1] as SentEvent),
  );
}

beforeAll(() => {
  tracker = new ErrorTracker(
    {
      SENTRY_DSN: 'https://public@sentry.example/1',
      SENTRY_ENVIRONMENT: 'staging',
      RELEASE: '854f8a0b',
      SERVER_ROLE: 'api',
    },
    () => ({
      send: (envelope) => {
        envelopes.push(envelope);
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
  );
});

afterAll(async () => {
  await tracker.onApplicationShutdown();
});

describe('the error tracker (Slice 9.6)', () => {
  it('sends a fault with its release, request, shop and route, its message redacted', async () => {
    tracker.capture(new Error('wallet refused 01712345678 with password=hunter2'), {
      requestId: 'K7MQ-4XR2',
      tenantId: '6f1c2b7e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
      route: '/api/v1/orders/:id',
    });
    await Sentry.flush(2_000);
    const event = sentEvents().at(-1);
    expect(event).toMatchObject({
      release: '854f8a0b',
      environment: 'staging',
      tags: {
        role: 'api',
        request_id: 'K7MQ-4XR2',
        tenant_id: '6f1c2b7e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
        route: '/api/v1/orders/:id',
      },
    });
    expect(event?.exception?.values?.[0]?.value).toBe(
      'wallet refused *******5678 with password=[masked]',
    );
    expect(event?.request).toBeUndefined();
  });

  it('sends one noisy error at most 10 times an hour', async () => {
    const before = sentEvents().length;
    for (let count = 0; count < 15; count += 1) {
      // From 15 places, so Sentry's own de-duplication of an identical repeat isn't what stops them.
      const error = new Error('the same fault');
      error.stack = `Error: the same fault\n    at place${String(count)} (worker.js:${String(count + 1)}:1)`;
      tracker.capture(error, { job: 'noisy' });
    }
    await Sentry.flush(2_000);
    expect(sentEvents().length - before).toBe(10);
    expect(sentEvents().at(-1)?.tags?.['job']).toBe('noisy');
  });

  it('sends a request’s fault from the server-fault path, with what it knows of the request', () => {
    const captured: unknown[] = [];
    const errors = new RequestErrors(
      {
        record: () => Promise.resolve(),
        countSince: () => Promise.resolve(0),
        latest: () => Promise.resolve([]),
        purgeBefore: () => Promise.resolve(0),
      },
      { capture: (error, scope) => captured.push({ error, scope }) },
    );
    const fault = new Error('boom');
    errors.fault(
      {
        method: 'POST',
        route: { path: '/api/v1/orders' },
        requestId: 'AB12-CD34',
        tenant: { id: 'shop-1' },
      },
      fault,
    );
    expect(captured).toEqual([
      {
        error: fault,
        scope: { requestId: 'AB12-CD34', tenantId: 'shop-1', route: '/api/v1/orders' },
      },
    ]);
  });

  it('sends nothing, and loads nothing, without SENTRY_DSN', () => {
    const off = new ErrorTracker({ SERVER_ROLE: 'worker' });
    const before = envelopes.length;
    off.capture(new Error('not sent'), {});
    expect(envelopes.length).toBe(before);
  });
});

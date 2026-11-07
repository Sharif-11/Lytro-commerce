import { describe, expect, it } from 'vitest';
import { CourierNoAnswer } from '../src/modules/couriers/ports/courier-adapter';
import { SteadfastAdapter } from '../src/modules/couriers/services/steadfast-adapter';
import { RIGHT_API_KEY, RIGHT_SECRET_KEY } from './support/fake-steadfast';

// Phase 7 Slice 7.5: how Steadfast's fraud check answer is read (FRD-01, D7-52). Its live answer of 2026-11-07 gave whole
// percentages as numbers; these cover what else it might send, so a change in its answer is read safely or not at all.
const ACCOUNT = {
  tenantId: 'tenant',
  connectionId: 'connection',
  credentials: { apiKey: RIGHT_API_KEY, secretKey: RIGHT_SECRET_KEY },
};
const PHONE = '01711000001';

function answering(status: number, body: unknown): { adapter: SteadfastAdapter; asked: string[] } {
  const asked: string[] = [];
  const send = (input: string | URL | Request): Promise<Response> => {
    asked.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': typeof body === 'string' ? 'text/html' : 'application/json' },
      }),
    );
  };
  return {
    adapter: new SteadfastAdapter('https://portal.packzy.com/api/v1', send),
    asked,
  };
}

describe("reading Steadfast's fraud check (FRD-01, D7-52)", () => {
  it('reads the live shape, asking for the phone in the path', async () => {
    const { adapter, asked } = answering(200, {
      status: 200,
      phone: PHONE,
      score: null,
      level: null,
      scoring_disabled: true,
      delivery_ratio: 100,
      cancellation_ratio: 0,
      return_ratio: 0,
      volume_band: 'medium',
      volume_range: '8',
      total_reports: 0,
      doubtful_reports: false,
      delivered_count: null,
      cancelled_count: null,
      fraud_categories: [],
    });
    expect(await adapter.fraudScore(ACCOUNT, PHONE)).toEqual({
      outcome: 'answered',
      figures: {
        deliveredPercent: 100,
        cancelledPercent: 0,
        returnedPercent: 0,
        volumeBand: 'medium',
        volumeRange: '8',
        reports: 0,
        doubtful: false,
        categories: [],
      },
    });
    expect(asked).toEqual([`https://portal.packzy.com/api/v1/fraud_check/score/${PHONE}`]);
  });

  it('takes percentages written as text, rounds them, and drops any outside 0 to 100', async () => {
    const { adapter } = answering(200, {
      status: 200,
      delivery_ratio: '91.67%',
      cancellation_ratio: '8.33',
      return_ratio: 140,
      volume_band: '  high ',
      volume_range: 25,
      total_reports: '3',
      doubtful_reports: true,
      fraud_categories: ['fake order', { name: 'refused' }, { label: 'abuse' }, 7, null],
    });
    const answer = await adapter.fraudScore(ACCOUNT, PHONE);
    expect(answer).toEqual({
      outcome: 'answered',
      figures: {
        deliveredPercent: 92,
        cancelledPercent: 8,
        returnedPercent: null,
        volumeBand: 'high',
        volumeRange: '25',
        reports: 3,
        doubtful: true,
        categories: ['fake order', 'refused', 'abuse', '7'],
      },
    });
  });

  it('keeps a phone with no record as nulls, and caps what it keeps of its words', async () => {
    const { adapter } = answering(200, {
      status: 200,
      delivery_ratio: null,
      cancellation_ratio: null,
      return_ratio: null,
      volume_band: 'none',
      volume_range: null,
      total_reports: -2,
      fraud_categories: Array.from({ length: 15 }, (_, index) =>
        `category ${String(index)} `.repeat(9),
      ),
    });
    const answer = await adapter.fraudScore(ACCOUNT, PHONE);
    if (answer.outcome !== 'answered') throw new Error('expected an answer');
    expect(answer.figures).toMatchObject({
      deliveredPercent: null,
      cancelledPercent: null,
      returnedPercent: null,
      volumeBand: 'none',
      volumeRange: null,
      reports: 0,
      doubtful: false,
    });
    expect(answer.figures.categories).toHaveLength(10);
    expect(answer.figures.categories.every((category) => category.length <= 60)).toBe(true);
  });

  it('is a refusal for a client error, and no answer for a changed shape, a server error or a page', async () => {
    const refused = await answering(401, {
      status: 401,
      message: 'Unauthorized.',
    }).adapter.fraudScore(ACCOUNT, PHONE);
    expect(refused).toEqual({
      outcome: 'refused',
      refusal: { message: 'Unauthorized.', login: true },
    });
    for (const [status, body] of [
      [200, { status: 200, phone: PHONE }],
      [500, { message: 'Server Error' }],
      [502, '<html>Bad gateway</html>'],
    ] as const) {
      await expect(
        answering(status, body).adapter.fraudScore(ACCOUNT, PHONE),
      ).rejects.toBeInstanceOf(CourierNoAnswer);
    }
  });
});

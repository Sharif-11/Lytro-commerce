import { describe, expect, it } from 'vitest';
import { R2UsageUnavailable } from '../src/modules/media-costs/ports/r2-usage';
import { CloudflareR2Usage } from '../src/modules/media-costs/providers/cloudflare-r2-usage';

// MED-12, D8-57, D8-62 (Phase 8 Slice 8.6): the server's GraphQL calls to Cloudflare's R2 analytics, against a
// stand-in for its API: what is asked, how its answer becomes each bucket's day, and what counts as a failure.
const SETTINGS = { accountId: 'account-1', apiToken: 'token-1' };

interface Call {
  url: string;
  query: string;
  variables: Record<string, unknown>;
  authorization: string | null;
}

function cloudflare(answers: Response[]): { usage: CloudflareR2Usage; calls: Call[] } {
  const calls: Call[] = [];
  const usage = new CloudflareR2Usage(SETTINGS, (url, init) => {
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as {
      query: string;
      variables: Record<string, unknown>;
    };
    calls.push({
      url,
      query: body.query,
      variables: body.variables,
      authorization: new Headers(init.headers).get('authorization'),
    });
    const answer = answers.shift();
    return answer ? Promise.resolve(answer) : Promise.reject(new Error('no answer'));
  });
  return { usage, calls };
}

const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
const account = (nodes: Record<string, unknown>): Response =>
  ok({ data: { viewer: { accounts: [nodes] } }, errors: null });

describe('CloudflareR2Usage', () => {
  it("asks for each day's operations and storage, every bucket, with the account's token", async () => {
    const { usage, calls } = cloudflare([account({ o0: [], s0: [], o1: [], s1: [] })]);
    await usage.days(['2031-01-31', '2031-02-01']);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(call?.authorization).toBe('Bearer token-1');
    expect(call?.variables).toEqual({ accountTag: 'account-1' });
    expect(call?.query).toContain(
      'o0: r2OperationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: "2031-01-31T00:00:00Z", datetime_lt: "2031-02-01T00:00:00Z" })',
    );
    expect(call?.query).toContain(
      's1: r2StorageAdaptiveGroups(limit: 10000, filter: { datetime_geq: "2031-02-01T00:00:00Z", datetime_lt: "2031-02-02T00:00:00Z" })',
    );
    // No bucket filter: the whole account, as the bill is (D8-59).
    expect(call?.query).not.toContain('bucketName:');
  });

  it("sorts operations into Cloudflare's price classes and takes the day's peak storage", async () => {
    const { usage } = cloudflare([
      account({
        o0: [
          {
            sum: { requests: 40 },
            dimensions: { actionType: 'PutObject', bucketName: 'lytro-media' },
          },
          {
            sum: { requests: 3 },
            dimensions: { actionType: 'ListObjects', bucketName: 'lytro-media' },
          },
          {
            sum: { requests: 900 },
            dimensions: { actionType: 'GetObject', bucketName: 'lytro-media' },
          },
          {
            sum: { requests: '12' },
            dimensions: { actionType: 'HeadObject', bucketName: 'lytro-media' },
          },
          {
            sum: { requests: 7 },
            dimensions: { actionType: 'DeleteObject', bucketName: 'lytro-media' },
          },
          // One the price list doesn't name is billed as Class A, the dearer (D8-62).
          {
            sum: { requests: 2 },
            dimensions: { actionType: 'DeleteObjects', bucketName: 'lytro-media' },
          },
          { sum: { requests: 5 }, dimensions: { actionType: 'ListBuckets', bucketName: '' } },
          {
            sum: { requests: 1 },
            dimensions: { actionType: 'PutObject', bucketName: 'lytro-uploads' },
          },
        ],
        s0: [
          {
            max: { payloadSize: 3_000, metadataSize: 100, objectCount: 9 },
            dimensions: { bucketName: 'lytro-media' },
          },
          {
            max: { payloadSize: 5_000, metadataSize: 200, objectCount: 11 },
            dimensions: { bucketName: 'lytro-media' },
          },
          {
            max: { payloadSize: 0, metadataSize: 0, objectCount: 0 },
            dimensions: { bucketName: 'lytro-evidence' },
          },
        ],
      }),
    ]);
    const figures = await usage.days(['2031-03-04']);
    expect(figures).toEqual([
      {
        day: '2031-03-04',
        bucket: 'lytro-media',
        classA: 45,
        classB: 912,
        freeOps: 7,
        peakBytes: 5_200,
        objects: 11,
      },
      { day: '2031-03-04', bucket: '', classA: 5, classB: 0, freeOps: 0, peakBytes: 0, objects: 0 },
      {
        day: '2031-03-04',
        bucket: 'lytro-uploads',
        classA: 1,
        classB: 0,
        freeOps: 0,
        peakBytes: 0,
        objects: 0,
      },
      {
        day: '2031-03-04',
        bucket: 'lytro-evidence',
        classA: 0,
        classB: 0,
        freeOps: 0,
        peakBytes: 0,
        objects: 0,
      },
    ]);
  });

  it('asks a few days a call', async () => {
    const days = Array.from(
      { length: 10 },
      (_, index) => `2031-05-${String(index + 1).padStart(2, '0')}`,
    );
    const empty = (count: number): Record<string, unknown> => {
      const nodes: Record<string, unknown> = {};
      for (let index = 0; index < count; index += 1) {
        nodes[`o${String(index)}`] = [];
        nodes[`s${String(index)}`] = [];
      }
      return nodes;
    };
    const { usage, calls } = cloudflare([account(empty(8)), account(empty(2))]);
    await usage.days(days);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.query).toContain('"2031-05-08T00:00:00Z", datetime_lt');
    expect(calls[1]?.query).toContain('o1: r2OperationsAdaptiveGroups');
    expect(calls[1]?.query).not.toContain('o2:');
  });

  it('fails on an error in the answer, a refusal, an answer that is not JSON, or no account', async () => {
    const failures: Response[] = [
      // GraphQL may send its errors beside data that looks whole.
      ok({
        data: { viewer: { accounts: [{ o0: [], s0: [] }] } },
        errors: [{ message: 'not authorized for that account' }],
      }),
      new Response('forbidden', { status: 403 }),
      new Response('<html>', { status: 200 }),
      ok({ data: { viewer: { accounts: [] } }, errors: null }),
    ];
    for (const answer of failures) {
      const { usage } = cloudflare([answer]);
      await expect(usage.days(['2031-06-01'])).rejects.toThrow(R2UsageUnavailable);
    }
    const { usage } = cloudflare([]);
    await expect(usage.days(['2031-06-01'])).rejects.toThrow(R2UsageUnavailable);
  });

  it('never writes anything but a day into the query', async () => {
    const { usage, calls } = cloudflare([]);
    await expect(usage.days(['2031-06-01" } } evil {'])).rejects.toThrow(R2UsageUnavailable);
    expect(calls).toHaveLength(0);
  });
});

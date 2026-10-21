import { MEDIA_BLOCKED_KEY, mediaOriginsKey } from '@lytronix/shared-types';
import { describe, expect, it } from 'vitest';
import { EdgeUnavailable } from '../src/modules/media/ports/media-edge';
import { CloudflareMediaEdge } from '../src/modules/media/providers/cloudflare-media-edge';

// MED-10, MED-13, BND-01: the server's calls to Cloudflare -- the usage query and the shared store's bulk write --
// against a stand-in for its API.
const SETTINGS = {
  accountId: 'account-1',
  apiToken: 'token-1',
  kvNamespaceId: 'namespace-1',
  dataset: 'lytro_media_usage',
};
const SHOP = '0b9f6a3e-6f3c-4f7e-9d2a-1c2b3d4e5f60';

interface Call {
  url: string;
  method: string;
  body: string;
  authorization: string | null;
}

function cloudflare(answers: Response[]): { edge: CloudflareMediaEdge; calls: Call[] } {
  const calls: Call[] = [];
  const edge = new CloudflareMediaEdge(SETTINGS, (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? init.body : '',
      authorization: headers.get('authorization'),
    });
    const answer = answers.shift();
    return answer ? Promise.resolve(answer) : Promise.reject(new Error('no answer'));
  });
  return { edge, calls };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('CloudflareMediaEdge usage (BND-01)', () => {
  it("asks for each shop's bytes and requests per minute, weighted by sampling, in the window", async () => {
    const { edge, calls } = cloudflare([
      ok({
        data: [
          { tenant_id: SHOP, minute: 1_792_000_020, bytes: 1234.4, requests: '3' },
          { tenant_id: 'not-a-shop', minute: 1_792_000_020, bytes: 99, requests: 1 },
          { tenant_id: SHOP, minute: '1792000080', bytes: '10.6', requests: 1 },
        ],
      }),
    ]);
    const usage = await edge.usageByMinute(
      new Date('2026-10-21T08:00:00Z'),
      new Date('2026-10-21T08:05:00Z'),
    );

    expect(calls[0]?.url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-1/analytics_engine/sql',
    );
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.authorization).toBe('Bearer token-1');
    expect(calls[0]?.body).toContain('SUM(_sample_interval * double1) AS bytes');
    expect(calls[0]?.body).toContain('FROM lytro_media_usage');
    expect(calls[0]?.body).toContain(
      "timestamp >= toDateTime('2026-10-21 08:00:00') AND timestamp < toDateTime('2026-10-21 08:05:00')",
    );
    expect(usage).toEqual([
      { tenantId: SHOP, minute: new Date(1_792_000_020_000), bytes: 1234, requests: 3 },
      { tenantId: SHOP, minute: new Date(1_792_000_080_000), bytes: 11, requests: 1 },
    ]);
  });

  it('is unavailable when Cloudflare refuses, cannot be reached, or does not answer in JSON', async () => {
    const from = new Date('2026-10-21T08:00:00Z');
    const to = new Date('2026-10-21T08:01:00Z');
    await expect(
      cloudflare([new Response('no', { status: 403 })]).edge.usageByMinute(from, to),
    ).rejects.toBeInstanceOf(EdgeUnavailable);
    await expect(cloudflare([]).edge.usageByMinute(from, to)).rejects.toBeInstanceOf(
      EdgeUnavailable,
    );
    await expect(
      cloudflare([new Response('<html>', { status: 200 })]).edge.usageByMinute(from, to),
    ).rejects.toBeInstanceOf(EdgeUnavailable);
  });
});

describe('CloudflareMediaEdge shared store (MED-10, MED-13)', () => {
  it('writes the blocked list and the changed addresses in one bulk call', async () => {
    const { edge, calls } = cloudflare([ok({ success: true, result: { unsuccessful_keys: [] } })]);
    await edge.write({
      blocked: { [SHOP]: 'bandwidth' },
      origins: [{ tenantId: SHOP, origins: ['https://myshop.com.bd'] }],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-1/storage/kv/namespaces/namespace-1/bulk',
    );
    expect(calls[0]?.method).toBe('PUT');
    expect(JSON.parse(calls[0]?.body ?? '[]')).toEqual([
      { key: mediaOriginsKey(SHOP), value: '["https://myshop.com.bd"]' },
      { key: MEDIA_BLOCKED_KEY, value: JSON.stringify({ [SHOP]: 'bandwidth' }) },
    ]);
  });

  it('splits more than 10,000 values into calls of 10,000', async () => {
    const answer = () => ok({ success: true, result: { unsuccessful_keys: [] } });
    const { edge, calls } = cloudflare([answer(), answer()]);
    const origins = Array.from({ length: 10_001 }, (_, index) => ({
      tenantId: `shop-${String(index)}`,
      origins: [],
    }));
    await edge.write({ origins });
    expect(calls.map((call) => (JSON.parse(call.body) as unknown[]).length)).toEqual([10_000, 1]);
  });

  it('is unavailable when any key was not written, so the pass writes it again', async () => {
    const { edge } = cloudflare([
      ok({ success: true, result: { unsuccessful_keys: [MEDIA_BLOCKED_KEY] } }),
    ]);
    await expect(edge.write({ blocked: {}, origins: [] })).rejects.toBeInstanceOf(EdgeUnavailable);
  });
});

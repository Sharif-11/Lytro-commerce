import { MEDIA_BLOCKED_KEY, mediaOriginsKey } from '@lytronix/shared-types';
import {
  EdgeUnavailable,
  type EdgeStoreChanges,
  type MediaEdge,
  type MediaUsageTotal,
} from '../ports/media-edge';

/** The account, the token, the shared store's namespace and the usage dataset (env.ts). */
export interface CloudflareEdgeSettings {
  accountId: string;
  apiToken: string;
  kvNamespaceId: string;
  /** Checked as a plain name in env.ts, since it is written into the query. */
  dataset: string;
}

const API = 'https://api.cloudflare.com/client/v4';
const SHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Workers KV's bulk write takes at most this many pairs a call.
const BULK_PAIRS = 10_000;

/** Analytics Engine's own time literal, in UTC: `YYYY-MM-DD HH:MM:SS`. */
function sqlTime(at: Date): string {
  return at.toISOString().slice(0, 19).replace('T', ' ');
}

/** A number the SQL API sent, as a number or as text; anything else is 0. */
function figure(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface UsageAnswer {
  data?: { tenant_id?: unknown; minute?: unknown; bytes?: unknown; requests?: unknown }[];
}

interface BulkAnswer {
  result?: { unsuccessful_keys?: unknown[] };
}

/**
 * MED-10, MED-13, BND-01: Cloudflare's API with one token. Usage comes from the Analytics Engine SQL API, summed per
 * shop and minute and weighted by each point's sample interval, so sampled data still totals right. The shared store
 * is written through Workers KV's bulk write, so a restart that writes every shop's addresses is a few calls, not one
 * a shop.
 */
export class CloudflareMediaEdge implements MediaEdge {
  constructor(
    private readonly settings: CloudflareEdgeSettings,
    private readonly fetcher: (url: string, init: RequestInit) => Promise<Response> = (url, init) =>
      fetch(url, init),
  ) {}

  async usageByMinute(from: Date, to: Date): Promise<MediaUsageTotal[]> {
    // index1 is the shop, double1 the bytes sent and double2 the requests (MEDIA_USAGE_POINT).
    const query = [
      'SELECT index1 AS tenant_id,',
      'intDiv(toUInt32(timestamp), 60) * 60 AS minute,',
      'SUM(_sample_interval * double1) AS bytes,',
      'SUM(_sample_interval * double2) AS requests',
      `FROM ${this.settings.dataset}`,
      `WHERE timestamp >= toDateTime('${sqlTime(from)}') AND timestamp < toDateTime('${sqlTime(to)}')`,
      'GROUP BY tenant_id, minute',
      'FORMAT JSON',
    ].join(' ');
    const answer = (await this.call(
      `${API}/accounts/${this.settings.accountId}/analytics_engine/sql`,
      { method: 'POST', body: query },
    )) as UsageAnswer;
    return (answer.data ?? []).flatMap((row) => {
      const tenantId = typeof row.tenant_id === 'string' ? row.tenant_id : '';
      if (!SHOP_ID.test(tenantId)) return [];
      return [
        {
          tenantId,
          minute: new Date(figure(row.minute) * 1000),
          bytes: Math.round(figure(row.bytes)),
          requests: Math.round(figure(row.requests)),
        },
      ];
    });
  }

  async write(changes: EdgeStoreChanges): Promise<void> {
    const pairs = changes.origins.map((shop) => ({
      key: mediaOriginsKey(shop.tenantId),
      value: JSON.stringify(shop.origins),
    }));
    if (changes.blocked)
      pairs.push({ key: MEDIA_BLOCKED_KEY, value: JSON.stringify(changes.blocked) });
    const { accountId, kvNamespaceId } = this.settings;
    for (let start = 0; start < pairs.length; start += BULK_PAIRS) {
      const answer = (await this.call(
        `${API}/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/bulk`,
        {
          method: 'PUT',
          body: JSON.stringify(pairs.slice(start, start + BULK_PAIRS)),
          headers: { 'content-type': 'application/json' },
        },
      )) as BulkAnswer;
      const failed = answer.result?.unsuccessful_keys?.length ?? 0;
      if (failed > 0) throw new EdgeUnavailable(`${String(failed)} keys were not written`);
    }
  }

  private async call(
    url: string,
    request: { method: string; body: string; headers?: Record<string, string> },
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...request,
        headers: { ...request.headers, authorization: `Bearer ${this.settings.apiToken}` },
      });
    } catch (error) {
      throw new EdgeUnavailable(String(error));
    }
    if (!response.ok) {
      throw new EdgeUnavailable(
        `Cloudflare answered ${String(response.status)}: ${await response.text()}`,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new EdgeUnavailable(`Cloudflare's answer was not JSON: ${String(error)}`);
    }
  }
}

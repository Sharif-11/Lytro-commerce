import { R2UsageUnavailable, type R2DayFigures, type R2Usage } from '../ports/r2-usage';
import { addDays } from '../services/media-cost-estimate';
import { priceClassOf } from '../services/r2-actions';

/** The account and the token, the same pair the media edge uses (env.ts); the token needs Account Analytics: Read. */
export interface CloudflareR2Settings {
  accountId: string;
  apiToken: string;
}

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Each day is two of Cloudflare's queries; a few days a call keeps every call small.
const DAYS_PER_CALL = 8;
// Its R2 datasets answer at most this many rows a query: far more than a day's operation kinds times buckets.
const ROW_LIMIT = 10_000;
const TIMEOUT_MS = 20_000;

interface OperationGroup {
  sum?: { requests?: unknown };
  dimensions?: { actionType?: unknown; bucketName?: unknown };
}

interface StorageGroup {
  max?: { objectCount?: unknown; payloadSize?: unknown; metadataSize?: unknown };
  dimensions?: { bucketName?: unknown };
}

interface GraphqlAnswer {
  data?: { viewer?: { accounts?: Record<string, unknown>[] } } | null;
  errors?: { message?: unknown }[] | null;
}

/** A count Cloudflare sent; anything else is 0. */
function count(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function bucketOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * MED-12, D8-57 (Phase 8 Slice 8.6): R2's own figures from Cloudflare's GraphQL Analytics API, a UTC day at a time per
 * bucket: operations summed by kind, and storage at its peak, which is what a GB-month averages. Cloudflare keeps
 * about 31 days of these, so the caller records them.
 */
export class CloudflareR2Usage implements R2Usage {
  readonly connected = true;

  constructor(
    private readonly settings: CloudflareR2Settings,
    private readonly fetcher: (url: string, init: RequestInit) => Promise<Response> = (url, init) =>
      fetch(url, init),
  ) {}

  async days(days: readonly string[]): Promise<R2DayFigures[]> {
    for (const day of days) if (!DAY.test(day)) throw new R2UsageUnavailable(`not a day: ${day}`);
    const figures: R2DayFigures[] = [];
    for (let start = 0; start < days.length; start += DAYS_PER_CALL) {
      figures.push(...(await this.batch(days.slice(start, start + DAYS_PER_CALL))));
    }
    return figures;
  }

  private async batch(days: readonly string[]): Promise<R2DayFigures[]> {
    const nodes = days.map((day, index) => {
      const filter = `{ datetime_geq: "${day}T00:00:00Z", datetime_lt: "${addDays(day, 1)}T00:00:00Z" }`;
      return [
        `o${String(index)}: r2OperationsAdaptiveGroups(limit: ${String(ROW_LIMIT)}, filter: ${filter}) {`,
        'sum { requests } dimensions { actionType bucketName } }',
        `s${String(index)}: r2StorageAdaptiveGroups(limit: ${String(ROW_LIMIT)}, filter: ${filter}) {`,
        'max { objectCount payloadSize metadataSize } dimensions { bucketName } }',
      ].join(' ');
    });
    const query = [
      'query R2Days($accountTag: string!) { viewer { accounts(filter: { accountTag: $accountTag }) {',
      ...nodes,
      '} } }',
    ].join(' ');
    const answer = await this.call({ query, variables: { accountTag: this.settings.accountId } });
    const account = answer.data?.viewer?.accounts?.[0];
    if (!account) throw new R2UsageUnavailable('no account in the answer');
    return days.flatMap((day, index) =>
      this.dayOf(day, account[`o${String(index)}`], account[`s${String(index)}`]),
    );
  }

  private dayOf(day: string, operations: unknown, storage: unknown): R2DayFigures[] {
    const buckets = new Map<string, R2DayFigures>();
    const figuresOf = (bucket: string): R2DayFigures => {
      let figures = buckets.get(bucket);
      if (!figures) {
        figures = { day, bucket, classA: 0, classB: 0, freeOps: 0, peakBytes: 0, objects: 0 };
        buckets.set(bucket, figures);
      }
      return figures;
    };
    for (const group of Array.isArray(operations) ? (operations as OperationGroup[]) : []) {
      const action =
        typeof group.dimensions?.actionType === 'string' ? group.dimensions.actionType : '';
      const requests = count(group.sum?.requests);
      if (requests === 0) continue;
      const figures = figuresOf(bucketOf(group.dimensions?.bucketName));
      const priceClass = priceClassOf(action);
      if (priceClass === 'free') figures.freeOps += requests;
      else figures[priceClass] += requests;
    }
    for (const group of Array.isArray(storage) ? (storage as StorageGroup[]) : []) {
      const figures = figuresOf(bucketOf(group.dimensions?.bucketName));
      figures.peakBytes = Math.max(
        figures.peakBytes,
        count(group.max?.payloadSize) + count(group.max?.metadataSize),
      );
      figures.objects = Math.max(figures.objects, count(group.max?.objectCount));
    }
    return [...buckets.values()];
  }

  private async call(body: {
    query: string;
    variables: Record<string, string>;
  }): Promise<GraphqlAnswer> {
    let response: Response;
    try {
      response = await this.fetcher(GRAPHQL, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.settings.apiToken}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new R2UsageUnavailable(String(error));
    }
    if (!response.ok) {
      throw new R2UsageUnavailable(
        `Cloudflare answered ${String(response.status)}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    let answer: GraphqlAnswer;
    try {
      answer = (await response.json()) as GraphqlAnswer;
    } catch (error) {
      throw new R2UsageUnavailable(`Cloudflare's answer was not JSON: ${String(error)}`);
    }
    // GraphQL answers 200 with its errors beside the data: a missing permission comes back this way.
    const errors = answer.errors ?? [];
    if (errors.length > 0) {
      const messages = errors
        .map((error) => (typeof error.message === 'string' ? error.message : 'error'))
        .join('; ');
      throw new R2UsageUnavailable(messages.slice(0, 300));
    }
    return answer;
  }
}

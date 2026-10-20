import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { MINUTE_MS, SECOND_MS, usageCycleStart } from '../../../common/time';
import type { ApiUsageStore, RequestQuotaNotifier } from '../ports/api-key-store';
import { API_USAGE_STORE, REQUEST_QUOTA_NOTIFIER } from '../tokens';
import type { ApiShop } from '../types/api-access';
import { monthlyLimit } from './request-limits';
import { ExpiringCache } from './expiring-cache';

// RED-04's pattern (D3-2): counts are added to PostgreSQL every minute and on shutdown; the stored total is read
// again at most every 15 seconds.
const FLUSH_EVERY_MS = MINUTE_MS;
const STORED_TOTAL_MS = 15 * SECOND_MS;
const STORED_TOTAL_ENTRIES = 10_000;
// RTE-03: the shares of a cycle's requests at which the shop is warned, once each.
const WARNINGS = [50, 80, 95] as const;

interface Pending {
  tenantId: string;
  cycleStart: Date;
  count: number;
  /** The cycle's limit when last counted, for the warnings at the next flush. */
  limit: number | null;
}

/**
 * RTE-03, D3-2: each shop's requests per billing cycle. A request is counted here as it is let through, and refused
 * once the stored total plus this server's unflushed count reaches the cycle's limit. Counts reach PostgreSQL every
 * minute; there the shop is warned at 50, 80 and 95 percent, once each. A new cycle -- a new period, an upgrade
 * (UPG-10) -- starts from zero.
 */
@Injectable()
export class RequestQuota implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger('RequestQuota');
  private readonly pending = new Map<string, Pending>();
  private readonly stored = new ExpiringCache<number>(STORED_TOTAL_MS, STORED_TOTAL_ENTRIES);
  private flusher: NodeJS.Timeout | null = null;

  constructor(
    @Inject(API_USAGE_STORE) private readonly store: ApiUsageStore,
    @Inject(REQUEST_QUOTA_NOTIFIER) private readonly notifier: RequestQuotaNotifier,
  ) {}

  onModuleInit(): void {
    this.flusher = setInterval(() => {
      void this.flush();
    }, FLUSH_EVERY_MS);
    this.flusher.unref();
  }

  onModuleDestroy(): void {
    if (this.flusher) clearInterval(this.flusher);
  }

  /** RED-04: what is counted here is not lost when the server stops. */
  async onApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  /** Counts the request against the shop's cycle; false when the cycle's requests are used up. */
  async take(shop: ApiShop, now: Date): Promise<boolean> {
    const limit = monthlyLimit(shop.limits);
    const cycleStart = usageCycleStart(shop.row, now);
    const key = `${shop.row.id}:${cycleStart.toISOString()}`;
    const stored = limit === null ? 0 : await this.storedTotal(shop.row.id, cycleStart, now);
    // Read after the wait, so two requests arriving together are judged one after the other.
    const pending = this.pending.get(key) ?? {
      tenantId: shop.row.id,
      cycleStart,
      count: 0,
      limit,
    };
    if (limit !== null && stored + pending.count >= limit) return false;
    this.pending.set(key, { ...pending, count: pending.count + 1, limit });
    return true;
  }

  /**
   * Adds this server's counts to the stored totals, and warns each shop that crossed a share of its cycle. A count
   * stays in the unflushed figure until it is stored, so a request arriving mid-flush is judged on the full total;
   * one that fails to store is kept for the next flush.
   */
  async flush(): Promise<void> {
    for (const [key, entry] of [...this.pending.entries()]) {
      const flushing = entry.count;
      const limit = entry.limit;
      try {
        const { requests, warn } = await this.store.run(async (tx) => {
          const row = await this.store.add(tx, entry.tenantId, entry.cycleStart, flushing);
          const reached =
            limit === null || limit === 0
              ? undefined
              : WARNINGS.filter((percent) => row.requests * 100 >= limit * percent).pop();
          if (reached === undefined || reached <= row.warnedPercent) {
            return { requests: row.requests, warn: null };
          }
          await this.store.setWarned(tx, entry.tenantId, entry.cycleStart, reached);
          return { requests: row.requests, warn: reached };
        });
        this.settle(key, flushing, requests);
        if (warn !== null && limit !== null) {
          await this.notifier.quotaWarning({
            tenantId: entry.tenantId,
            cycleStart: entry.cycleStart,
            percent: warn,
            requests,
            limit,
          });
        }
      } catch (error) {
        this.logger.error(
          `could not store API request counts for ${entry.tenantId}`,
          error as Error,
        );
      }
    }
  }

  /** A flushed count moves from the unflushed figure into the stored total in one step. */
  private settle(key: string, flushed: number, storedNow: number): void {
    const pending = this.pending.get(key);
    if (pending) {
      const left = pending.count - flushed;
      if (left > 0) this.pending.set(key, { ...pending, count: left });
      else this.pending.delete(key);
    }
    this.stored.set(key, storedNow, Date.now());
  }

  private async storedTotal(tenantId: string, cycleStart: Date, now: Date): Promise<number> {
    const key = `${tenantId}:${cycleStart.toISOString()}`;
    const cached = this.stored.get(key, now.getTime());
    if (cached !== undefined) return cached;
    const row = await this.store.find(tenantId, cycleStart);
    const total = row?.requests ?? 0;
    this.stored.set(key, total, now.getTime());
    return total;
  }
}

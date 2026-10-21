import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { DAY_MS, MINUTE_MS, SECOND_MS, usageCycleStart } from '../../../common/time';
import { warningDue } from '../../../common/usage-warnings';
import type { ApiUsageStore, RequestQuotaNotifier } from '../ports/api-key-store';
import { API_USAGE_STORE, REQUEST_QUOTA_NOTIFIER } from '../tokens';
import type { ApiShop, ApiUsageCounts } from '../types/public-api';
import { monthlyLimit } from './request-limits';
import { ExpiringCache } from './expiring-cache';

// RED-04's pattern (D3-2): counts are added to PostgreSQL every minute and on shutdown; the stored total is read
// again at most every 15 seconds.
const FLUSH_EVERY_MS = MINUTE_MS;
const STORED_TOTAL_MS = 15 * SECOND_MS;
const STORED_TOTAL_ENTRIES = 10_000;
// RTE-06: the visitors a shop's cycle remembers as refused already. Past it, each refusal counts its visitor as new,
// so a flood from very many addresses costs bounded memory. A cycle's are forgotten once it must have ended.
const REFUSED_VISITORS_REMEMBERED = 10_000;
const REFUSED_VISITORS_KEPT_MS = 32 * DAY_MS;

interface Pending {
  tenantId: string;
  cycleStart: Date;
  count: number;
  /** RTE-06: requests the per-visitor limit refused, and the visitors among them not refused before this cycle. */
  refused: number;
  refusedVisitors: number;
  /** The cycle's limit when last counted, for the warnings at the next flush. */
  limit: number | null;
}

/** The cycle a shop's counts belong to. */
function cycleKey(tenantId: string, cycleStart: Date): string {
  return `${tenantId}:${cycleStart.toISOString()}`;
}

/**
 * RTE-03, D3-2: each shop's requests per billing cycle. A request is counted here as it is let through, and refused
 * once the stored total plus this server's unflushed count reaches the cycle's limit. Counts reach PostgreSQL every
 * minute; there the shop is warned at 50, 80 and 95 percent, once each. A new cycle -- a new period, an upgrade
 * (UPG-10) -- starts from zero. The requests the per-visitor limit refused are counted here too (RTE-06).
 */
@Injectable()
export class RequestQuota implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly logger = new Logger('RequestQuota');
  private readonly pending = new Map<string, Pending>();
  private readonly stored = new ExpiringCache<number>(STORED_TOTAL_MS, STORED_TOTAL_ENTRIES);
  private readonly refusedVisitors = new Map<string, { cycleStart: Date; visitors: Set<string> }>();
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

  /**
   * RED-04: what is counted here is not lost when the server stops. After every module has stopped taking work and
   * before the database pool closes, which DatabaseService leaves to the very last step of shutting down.
   */
  async beforeApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  /** Counts the request against the shop's cycle; false when the cycle's requests are used up. */
  async take(shop: ApiShop, now: Date): Promise<boolean> {
    const limit = monthlyLimit(shop.limits);
    const cycleStart = usageCycleStart(shop.row, now);
    const key = cycleKey(shop.row.id, cycleStart);
    const stored = limit === null ? 0 : await this.storedTotal(shop.row.id, cycleStart, now);
    // Read after the wait, so two requests arriving together are judged one after the other.
    const pending = this.pendingOf(key, shop.row.id, cycleStart);
    if (limit !== null && stored + pending.count >= limit) return false;
    this.pending.set(key, { ...pending, count: pending.count + 1, limit });
    return true;
  }

  /** LIM-02: the shop's requests in the cycle: those stored, and those this server has not stored yet. */
  async used(tenantId: string, cycleStart: Date, now: Date): Promise<number> {
    const stored = await this.storedTotal(tenantId, cycleStart, now);
    return stored + (this.pending.get(cycleKey(tenantId, cycleStart))?.count ?? 0);
  }

  /**
   * RTE-06, KNOWN-GAPS §82: counts a request the per-visitor limit refused against the shop's cycle, and its visitor
   * once a cycle. This server alone remembers the visitors, so after a restart one may be counted again, until Phase 9
   * keeps them in the shared Redis.
   */
  refused(shop: ApiShop, visitor: string, now: Date): void {
    const cycleStart = usageCycleStart(shop.row, now);
    const key = cycleKey(shop.row.id, cycleStart);
    const pending = this.pendingOf(key, shop.row.id, cycleStart);
    const newVisitor = this.firstRefusal(key, cycleStart, visitor) ? 1 : 0;
    this.pending.set(key, {
      ...pending,
      refused: pending.refused + 1,
      refusedVisitors: pending.refusedVisitors + newVisitor,
      limit: monthlyLimit(shop.limits),
    });
  }

  /**
   * Adds this server's counts to the stored totals, and warns each shop that crossed a share of its cycle. A count
   * stays in the unflushed figure until it is stored, so a request arriving mid-flush is judged on the full total;
   * one that fails to store is kept for the next flush.
   */
  async flush(): Promise<void> {
    this.forgetEndedCycles(Date.now());
    for (const [key, entry] of [...this.pending.entries()]) {
      const flushing: ApiUsageCounts = {
        requests: entry.count,
        refusedRequests: entry.refused,
        refusedVisitors: entry.refusedVisitors,
      };
      const limit = entry.limit;
      try {
        const { requests, warn } = await this.store.run(async (tx) => {
          const row = await this.store.add(tx, entry.tenantId, entry.cycleStart, flushing);
          const reached = warningDue(row.requests, limit, row.warnedPercent);
          if (reached === null) return { requests: row.requests, warn: null };
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
  private settle(key: string, flushed: ApiUsageCounts, storedNow: number): void {
    const pending = this.pending.get(key);
    if (pending) {
      const left = {
        ...pending,
        count: pending.count - flushed.requests,
        refused: pending.refused - flushed.refusedRequests,
        refusedVisitors: pending.refusedVisitors - flushed.refusedVisitors,
      };
      if (left.count > 0 || left.refused > 0 || left.refusedVisitors > 0) {
        this.pending.set(key, left);
      } else {
        this.pending.delete(key);
      }
    }
    this.stored.set(key, storedNow, Date.now());
  }

  private pendingOf(key: string, tenantId: string, cycleStart: Date): Pending {
    return (
      this.pending.get(key) ?? {
        tenantId,
        cycleStart,
        count: 0,
        refused: 0,
        refusedVisitors: 0,
        limit: null,
      }
    );
  }

  /** True the first time this cycle the visitor is refused, as far as this server remembers. */
  private firstRefusal(key: string, cycleStart: Date, visitor: string): boolean {
    const seen = this.refusedVisitors.get(key) ?? { cycleStart, visitors: new Set<string>() };
    this.refusedVisitors.set(key, seen);
    if (seen.visitors.has(visitor)) return false;
    if (seen.visitors.size < REFUSED_VISITORS_REMEMBERED) seen.visitors.add(visitor);
    return true;
  }

  private forgetEndedCycles(now: number): void {
    for (const [key, seen] of [...this.refusedVisitors.entries()]) {
      if (seen.cycleStart.getTime() < now - REFUSED_VISITORS_KEPT_MS)
        this.refusedVisitors.delete(key);
    }
  }

  private async storedTotal(tenantId: string, cycleStart: Date, now: Date): Promise<number> {
    const key = cycleKey(tenantId, cycleStart);
    const cached = this.stored.get(key, now.getTime());
    if (cached !== undefined) return cached;
    const row = await this.store.find(tenantId, cycleStart);
    const total = row?.requests ?? 0;
    this.stored.set(key, total, now.getTime());
    return total;
  }
}

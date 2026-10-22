import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ApiUsageRow, BillingInfoRow, Transaction } from '@lytronix/db';
import { PACK_AUTO_BUY_CAP, PackAutoBuyState, UsageMetric } from '@lytronix/validators';
import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS, usageCycleStart } from '../../../common/time';
import {
  allowanceOf,
  cyclePacks,
  levelOf,
  NO_PACKS,
  packTaken,
  passedShare,
  pastGrace,
  recordedShare,
  servingShares,
  warningDue,
  type CyclePacks,
} from '../../../common/usage-warnings';
import type { PackAutoBuys } from '../../usage-warnings/ports/pack-auto-buys';
import type { UsageNotices } from '../../usage-warnings/ports/usage-notices';
import { UsageSettings } from '../../usage-warnings/services/usage-settings';
import { PACK_AUTO_BUYS, USAGE_NOTICES } from '../../usage-warnings/tokens';
import type { ApiUsageStore } from '../ports/api-key-store';
import { API_USAGE_STORE } from '../tokens';
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
// RTE-12: a shop's fast-spend alert goes out at most this often.
const FAST_SPEND_ALERT_EVERY_MS = DAY_MS;

interface Pending {
  tenantId: string;
  cycleStart: Date;
  count: number;
  /** RTE-06: requests the per-visitor limit refused, and the visitors among them not refused before this cycle. */
  refused: number;
  refusedVisitors: number;
  /** The cycle's limit when last counted, for the warnings at the next flush. */
  limit: number | null;
  /** PLN-15: whether the shop had auto-buy of request packs on when last counted. */
  autoBuy: boolean;
}

/** RTE-03, RTE-11: a cycle's stored requests, and what the shop's packs hold for it. */
interface StoredCycle {
  requests: number;
  packs: CyclePacks;
}

/** The cycle a shop's counts belong to. */
function cycleKey(tenantId: string, cycleStart: Date): string {
  return `${tenantId}:${cycleStart.toISOString()}`;
}

/**
 * RTE-03, RTE-12, D3-2: each shop's requests per billing cycle. A request is counted here as it is let through, and
 * refused once the stored total plus this server's unflushed count is past the cycle's limit and the grace after it.
 * Counts reach PostgreSQL every minute; there the shop is told at 50, 80, 95 and 100 percent and at its stop, once
 * each, and of an hour that spent a fast share of the cycle, at most once a day. A new cycle -- a new period, an
 * upgrade (UPG-10) -- starts from zero. The requests the per-visitor limit refused are counted here too (RTE-06).
 */
@Injectable()
export class RequestQuota implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly logger = new Logger('RequestQuota');
  private readonly pending = new Map<string, Pending>();
  private readonly stored = new ExpiringCache<StoredCycle>(STORED_TOTAL_MS, STORED_TOTAL_ENTRIES);
  private readonly refusedVisitors = new Map<string, { cycleStart: Date; visitors: Set<string> }>();
  // RTE-12: each shop's requests in the clock hour now running, as this server let them through.
  private readonly hours = new Map<string, { hour: number; count: number }>();
  private flusher: NodeJS.Timeout | null = null;

  constructor(
    @Inject(API_USAGE_STORE) private readonly store: ApiUsageStore,
    @Inject(USAGE_NOTICES) private readonly notices: UsageNotices,
    @Inject(PACK_AUTO_BUYS) private readonly autoBuys: PackAutoBuys,
    @Inject(UsageSettings) private readonly settings: UsageSettings,
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

  /**
   * Counts the request against the shop's cycle; false once the cycle's allowance -- its own requests, then its packs
   * (RTE-11) -- and the grace after it are used up (RTE-03): past the allowance the shop is still served while its owner
   * is told.
   */
  async take(shop: ApiShop, now: Date): Promise<boolean> {
    const limit = monthlyLimit(shop.limits);
    const cycleStart = usageCycleStart(shop.row, now);
    const key = cycleKey(shop.row.id, cycleStart);
    const [stored, grace] =
      limit === null
        ? [{ requests: 0, packs: NO_PACKS }, 0]
        : await Promise.all([
            this.storedCycle(shop.row.id, cycleStart, now),
            this.settings.gracePercent(),
          ]);
    // Read after the wait, so two requests arriving together are judged one after the other.
    const pending = this.pendingOf(key, shop.row.id, cycleStart);
    if (pastGrace(stored.requests + pending.count, limit, grace, stored.packs)) return false;
    this.pending.set(key, {
      ...pending,
      count: pending.count + 1,
      limit,
      autoBuy: shop.row.autoBuyRequests,
    });
    this.countHour(shop.row.id, now);
    return true;
  }

  /** LIM-02: the shop's requests in the cycle: those stored, and those this server has not stored yet. */
  async used(tenantId: string, cycleStart: Date, now: Date): Promise<number> {
    const stored = await this.storedCycle(tenantId, cycleStart, now);
    return stored.requests + (this.pending.get(cycleKey(tenantId, cycleStart))?.count ?? 0);
  }

  /**
   * LIM-02, RTE-11, PLN-15: what the shop's request packs hold for the cycle, and how auto-buy stands in it -- for the
   * usage page and its notices.
   */
  async packsOf(
    tenantId: string,
    cycleStart: Date,
  ): Promise<{ packs: CyclePacks; autoPacks: number; autoBuyState: PackAutoBuyState | null }> {
    const [row, bought, taken] = await Promise.all([
      this.store.find(tenantId, cycleStart),
      this.store.packsBought(tenantId),
      this.store.packsTaken(tenantId),
    ]);
    return {
      packs: cyclePacks(bought, taken, row ?? { packUsed: 0, packFree: 0 }),
      autoPacks: row?.autoPacks ?? 0,
      autoBuyState: row?.autoBuyState ?? null,
    };
  }

  /**
   * RTE-11, PLN-15: a request pack of `added` requests was just bought, in `tx`. As for bandwidth (BND-04), a pack bought
   * past the allowance adds its full amount on top of what is used -- this server's unstored count with the stored one
   * -- the warnings start again against the new allowance, and a failed auto-buy may try again.
   */
  async packBought(
    tx: Transaction,
    tenantId: string,
    shop: Pick<BillingInfoRow, 'state' | 'periodStart' | 'createdAt'>,
    limit: number | null,
    added: number,
    now: Date,
  ): Promise<void> {
    const cycleStart = usageCycleStart(shop, now);
    const key = cycleKey(tenantId, cycleStart);
    const cycle = await this.store.lockCycle(tx, tenantId, cycleStart);
    this.stored.delete(key);
    const packs = await this.cyclePacksIn(tx, tenantId, cycle);
    const after = allowanceOf(limit, packs);
    if (after === null) return;
    const used = cycle.requests + (this.pending.get(key)?.count ?? 0);
    const free = cycle.packFree + Math.max(used - (after - added), 0);
    await this.store.updateCycle(tx, tenantId, cycleStart, {
      packFree: free,
      warnedPercent: passedShare(used, after + (free - cycle.packFree)),
      autoBuyState: cycle.autoBuyState === PackAutoBuyState.Failed ? null : cycle.autoBuyState,
    });
  }

  /** RTE-11: how auto-buy stands in the shop's cycle, locked for the purchase that settles it. */
  async autoBuyOf(
    tx: Transaction,
    tenantId: string,
    cycleStart: Date,
  ): Promise<Pick<ApiUsageRow, 'autoPacks' | 'autoBuyState'>> {
    const cycle = await this.store.lockCycle(tx, tenantId, cycleStart);
    return { autoPacks: cycle.autoPacks, autoBuyState: cycle.autoBuyState };
  }

  /** RTE-11: auto-buy's asked-for pack is settled -- bought (one more this cycle), failed for the balance, or not due. */
  async autoBuyDone(
    tx: Transaction,
    tenantId: string,
    cycleStart: Date,
    outcome: 'bought' | 'failed' | 'skipped',
  ): Promise<void> {
    const cycle = await this.store.lockCycle(tx, tenantId, cycleStart);
    await this.store.updateCycle(tx, tenantId, cycleStart, {
      autoPacks: cycle.autoPacks + (outcome === 'bought' ? 1 : 0),
      autoBuyState: outcome === 'failed' ? PackAutoBuyState.Failed : null,
    });
  }

  /** RTE-12: when the cycle's last fast-spend alert went out, if one did. */
  async fastSpendAlertedAt(tenantId: string, cycleStart: Date): Promise<Date | null> {
    return (await this.store.find(tenantId, cycleStart))?.fastSpendAlertedAt ?? null;
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
   * Adds this server's counts to the stored totals, and queues the notices now due in the same transaction, so a flush
   * that fails tells no one (SCL-08). A count stays in the unflushed figure until it is stored, so a request arriving
   * mid-flush is judged on the full total; one that fails to store is kept for the next flush.
   */
  async flush(): Promise<void> {
    const now = new Date();
    this.forgetEndedCycles(now.getTime());
    const [grace, fastPercent] = await Promise.all([
      this.settings.gracePercent(),
      this.settings.fastSpendPercent(),
    ]);
    for (const [key, entry] of [...this.pending.entries()]) {
      const flushing: ApiUsageCounts = {
        requests: entry.count,
        refusedRequests: entry.refused,
        refusedVisitors: entry.refusedVisitors,
      };
      const limit = entry.limit;
      try {
        const stored = await this.store.run(async (tx): Promise<StoredCycle> => {
          const row = await this.store.add(tx, entry.tenantId, entry.cycleStart, flushing);
          if (limit === null) return { requests: row.requests, packs: NO_PACKS };
          const packs = await this.cyclePacksIn(tx, entry.tenantId, row);
          // RTE-11: what the cycle has taken from the packs follows its use past the limit, as far as they reach.
          const taken = packTaken(row.requests, limit, packs);
          if (taken !== row.packUsed) {
            await this.store.updateCycle(tx, entry.tenantId, entry.cycleStart, { packUsed: taken });
          }
          const allowance = allowanceOf(limit, packs) ?? limit;
          const notice = {
            tenantId: entry.tenantId,
            metric: UsageMetric.Requests,
            limit: allowance,
            cycleStart: entry.cycleStart.toISOString(),
          };
          const reached = warningDue(
            row.requests,
            allowance,
            row.warnedPercent,
            servingShares(grace, limit, allowance),
          );
          if (reached !== null) {
            await this.store.setWarned(
              tx,
              entry.tenantId,
              entry.cycleStart,
              recordedShare(reached),
            );
            await this.notices.queue(tx, {
              ...notice,
              level: levelOf(reached),
              used: row.requests,
            });
          }
          // RTE-11, PLN-15: at the allowance, auto-buy asks for one pack -- once at a time, up to the cycle's cap. The
          // cycle's row is locked by the add, so two servers never both ask.
          if (
            entry.autoBuy &&
            row.requests >= allowance &&
            row.autoPacks < PACK_AUTO_BUY_CAP &&
            row.autoBuyState === null
          ) {
            await this.store.updateCycle(tx, entry.tenantId, entry.cycleStart, {
              autoBuyState: PackAutoBuyState.Requested,
            });
            await this.autoBuys.queue(tx, {
              tenantId: entry.tenantId,
              metric: UsageMetric.Requests,
              cycleStart: entry.cycleStart.toISOString(),
            });
          }
          // RTE-12: an hour that spent a fast share of the cycle, told of at most once a day.
          const hour = this.hours.get(entry.tenantId)?.count ?? 0;
          const alerted = row.fastSpendAlertedAt;
          if (
            hour * 100 >= limit * fastPercent &&
            (alerted === null || now.getTime() - alerted.getTime() >= FAST_SPEND_ALERT_EVERY_MS)
          ) {
            await this.store.setFastSpendAlerted(tx, entry.tenantId, entry.cycleStart, now);
            await this.notices.queue(tx, { ...notice, limit, level: 'fast_spend', used: hour });
          }
          return { requests: row.requests, packs };
        });
        this.settle(key, flushing, stored);
      } catch (error) {
        this.logger.error(
          `could not store API request counts for ${entry.tenantId}`,
          error as Error,
        );
      }
    }
    this.forgetEndedHours(now);
  }

  /** A flushed count moves from the unflushed figure into the stored total in one step. */
  private settle(key: string, flushed: ApiUsageCounts, storedNow: StoredCycle): void {
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
        autoBuy: false,
      }
    );
  }

  /** RTE-11: what the shop's packs hold for this cycle, read in `tx` so a pack just bought counts. */
  private async cyclePacksIn(
    tx: Transaction,
    tenantId: string,
    cycle: Pick<ApiUsageRow, 'packUsed' | 'packFree'>,
  ): Promise<CyclePacks> {
    const [bought, taken] = await Promise.all([
      this.store.packsBought(tenantId, tx),
      this.store.packsTaken(tenantId, tx),
    ]);
    return cyclePacks(bought, taken, cycle);
  }

  /** RTE-12: one more request in the shop's clock hour; a new hour starts again from one. */
  private countHour(tenantId: string, now: Date): void {
    const hour = Math.floor(now.getTime() / HOUR_MS);
    const counted = this.hours.get(tenantId);
    this.hours.set(tenantId, {
      hour,
      count: counted?.hour === hour ? counted.count + 1 : 1,
    });
  }

  /** The hours that ended are let go once flushed, so memory follows the shops busy now. */
  private forgetEndedHours(now: Date): void {
    const hour = Math.floor(now.getTime() / HOUR_MS);
    for (const [tenantId, counted] of [...this.hours.entries()]) {
      if (counted.hour < hour) this.hours.delete(tenantId);
    }
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

  private async storedCycle(tenantId: string, cycleStart: Date, now: Date): Promise<StoredCycle> {
    const key = cycleKey(tenantId, cycleStart);
    const cached = this.stored.get(key, now.getTime());
    if (cached !== undefined) return cached;
    const { packs } = await this.packsOf(tenantId, cycleStart);
    const row = await this.store.find(tenantId, cycleStart);
    const stored = { requests: row?.requests ?? 0, packs };
    this.stored.set(key, stored, now.getTime());
    return stored;
  }
}

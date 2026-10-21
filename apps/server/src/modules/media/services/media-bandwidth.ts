import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EdgeShopRow, Transaction } from '@lytronix/db';
import type { MediaBlockReason, MediaBlockedList } from '@lytronix/shared-types';
import {
  limitOf,
  UsageMetric,
  withOverrides,
  type PlanLimits,
  type UsageLimitKey,
} from '@lytronix/validators';
import { DAY_MS, MINUTE_MS, dhakaDate, usageCycleStart } from '../../../common/time';
import { levelOf, pastGrace, servingShares, warningDue } from '../../../common/usage-warnings';
import { CLOSED_STATES } from '../../tenancy/services/tenant-resolver.service';
import type { UsageNotices } from '../../usage-warnings/ports/usage-notices';
import { UsageSettings } from '../../usage-warnings/services/usage-settings';
import { USAGE_NOTICES } from '../../usage-warnings/tokens';
import type { BandwidthStore, LimitOverrideRow } from '../ports/bandwidth-store';
import type { MediaEdge, MediaUsageTotal, ShopOrigins } from '../ports/media-edge';
import { BANDWIDTH_SETTINGS, BANDWIDTH_STORE, MEDIA_CLOCK, MEDIA_EDGE } from '../tokens';
import type { BandwidthUsage } from '../types/media';

export const GB = 1024 * 1024 * 1024;

// BND-02: a minute is totalled once it is this old, so the Worker's data points for it have all arrived. Cloudflare
// names no delay for Analytics Engine; a point is written as each response ends.
const SETTLE_MS = MINUTE_MS;
// After a stop, the Worker's usage is read an hour at a time until the pass has caught up.
const STEP_MS = 60 * MINUTE_MS;
// A monthly cycle is at most 31 days, so every shop's current cycle began within this.
const LONGEST_CYCLE_MS = 31 * DAY_MS;
// LIF-19: a deleted shop's files go in the deletion job after it; the shop stays blocked this long, so none is
// served while the job runs or is retried.
const DELETED_BLOCKED_MS = 30 * DAY_MS;
const BANDWIDTH_KEY: UsageLimitKey = 'bandwidth_gb';

/** What the minute's pass needs that only the server's settings know. */
export interface BandwidthSettings {
  /** MED-13: the shop's own address, `<slug>.<PLATFORM_DOMAIN>`, always one of its website addresses. */
  shopOrigin: (slug: string) => string;
}

/** PLN-11, PLN-19: the shop's bandwidth for a cycle in bytes, its overrides laid over its plan; null is unlimited. */
function limitBytes(
  snapshot: PlanLimits | null,
  overrides: readonly LimitOverrideRow[],
): number | null {
  const gb = limitOf(withOverrides(snapshot, overrides), BANDWIDTH_KEY);
  return gb === null ? null : gb * GB;
}

function cycleKey(tenantId: string, cycleStart: Date): string {
  return `${tenantId}|${cycleStart.toISOString()}`;
}

function byShop<T extends { tenantId: string }>(rows: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) grouped.set(row.tenantId, [...(grouped.get(row.tenantId) ?? []), row]);
  return grouped;
}

interface DaySum {
  shop: EdgeShopRow;
  cycleStart: Date;
  day: string;
  bytes: number;
  requests: number;
}

/**
 * BND-01 to BND-03, BND-05, BND-06, BND-08, MED-10, MED-13, D3-4: each shop's media bandwidth. Every minute the media
 * Worker's usage is added to each shop's cycle and day -- once, however many servers run the pass -- and the shop is
 * told at 50, 80, 95 and 100 percent of its cycle's limit, and when its grace past the limit is used too, once each.
 * Then the shared store the Worker reads is brought up to date: which shops are blocked (past their bandwidth and its
 * grace, or offline) and each shop's website addresses. A new cycle (a new period, an upgrade) starts from zero.
 */
@Injectable()
export class MediaBandwidth {
  private readonly logger = new Logger('MediaBandwidth');
  // What this server last wrote to the shared store, so a minute writes only what changed; a restart writes it all.
  private publishedBlocked: string | null = null;
  private readonly publishedOrigins = new Map<string, string>();
  // One pass at a time on this server, so two never both find the same change and write it twice.
  private running: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(BANDWIDTH_STORE) private readonly store: BandwidthStore,
    @Inject(MEDIA_EDGE) private readonly edge: MediaEdge,
    @Inject(USAGE_NOTICES) private readonly notices: UsageNotices,
    @Inject(UsageSettings) private readonly usageSettings: UsageSettings,
    @Inject(BANDWIDTH_SETTINGS) private readonly settings: BandwidthSettings,
    @Inject(MEDIA_CLOCK) private readonly clock: () => Date,
  ) {}

  /** The minute's pass: count, then publish. Either failing is logged and tried again next minute. */
  runMinute(): Promise<{ counted: number; blocked: number; written: number }> {
    const run = this.running.then(() => this.runOnce());
    this.running = run.catch(() => undefined);
    return run;
  }

  private async runOnce(): Promise<{ counted: number; blocked: number; written: number }> {
    const now = this.clock();
    let counted = 0;
    try {
      counted = await this.count(now);
    } catch (error) {
      // MED-10: operator alert, as a log line until alerting exists (OD-43).
      this.logger.error('could not total the media Worker usage', error as Error);
    }
    try {
      return { counted, ...(await this.publish(now)) };
    } catch (error) {
      // MED-10: operator alert, as a log line until alerting exists (OD-43).
      this.logger.error('could not write the media Worker shared store', error as Error);
      return { counted, blocked: 0, written: 0 };
    }
  }

  /**
   * BND-01, BND-02, BND-05: adds every settled minute of the Worker's usage not yet totalled to its shop's cycle and
   * day. Each step holds the record of how far usage is totalled, so a minute is never added twice, and a step that
   * cannot read the usage changes nothing. How many shop-minutes were added.
   */
  async count(now: Date): Promise<number> {
    const until = new Date(Math.floor((now.getTime() - SETTLE_MS) / MINUTE_MS) * MINUTE_MS);
    const shops = new Map((await this.store.listEdgeShops(now)).map((shop) => [shop.id, shop]));
    const overrides = byShop(await this.store.listOverridesFor(BANDWIDTH_KEY));
    const shares = servingShares(await this.usageSettings.gracePercent());
    let counted = 0;
    for (;;) {
      const step = await this.store.run(async (tx) => {
        const from = await this.store.lockPulledUntil(tx);
        if (from >= until) return null;
        const to = new Date(Math.min(until.getTime(), from.getTime() + STEP_MS));
        const usage = await this.edge.usageByMinute(from, to);
        await this.add(tx, usage, shops, overrides, shares, now);
        await this.store.setPulledUntil(tx, to);
        return usage.length;
      });
      if (step === null) return counted;
      counted += step;
    }
  }

  /**
   * MED-10, MED-13, BND-03, LIF-07: writes what changed in the shared store -- the blocked list, and each shop's
   * website addresses (its own address and its live keys' websites).
   */
  async publish(now: Date): Promise<{ blocked: number; written: number }> {
    const [shops, cycles, overrides, websites, grace] = await Promise.all([
      this.store.listEdgeShops(new Date(now.getTime() - DELETED_BLOCKED_MS)),
      this.store.listCyclesSince(new Date(now.getTime() - LONGEST_CYCLE_MS)),
      this.store.listOverridesFor(BANDWIDTH_KEY),
      this.store.listLiveWebsites(now),
      this.usageSettings.gracePercent(),
    ]);
    const used = new Map(cycles.map((row) => [cycleKey(row.tenantId, row.cycleStart), row.bytes]));
    const limits = byShop(overrides);
    const sites = byShop(websites);
    const reasons: [string, MediaBlockReason][] = [];
    const origins: ShopOrigins[] = [];
    for (const shop of shops) {
      const usedBytes = used.get(cycleKey(shop.id, usageCycleStart(shop, now))) ?? 0;
      const reason = this.blockReason(shop, usedBytes, limits.get(shop.id) ?? [], grace);
      if (reason !== null) reasons.push([shop.id, reason]);
      if (shop.deletedAt !== null) continue;
      const list = [
        ...new Set([
          this.settings.shopOrigin(shop.slug),
          ...(sites.get(shop.id) ?? []).flatMap((key) => key.websites),
        ]),
      ].sort();
      if (this.publishedOrigins.get(shop.id) !== JSON.stringify(list)) {
        origins.push({ tenantId: shop.id, origins: list });
      }
    }
    const blocked: MediaBlockedList = Object.fromEntries(
      reasons.sort(([a], [b]) => a.localeCompare(b)),
    );
    const blockedValue = JSON.stringify(blocked);
    const blockedChanged = blockedValue !== this.publishedBlocked;
    if (blockedChanged || origins.length > 0) {
      await this.edge.write({ ...(blockedChanged ? { blocked } : {}), origins });
      this.publishedBlocked = blockedValue;
      for (const shop of origins)
        this.publishedOrigins.set(shop.tenantId, JSON.stringify(shop.origins));
    }
    return { blocked: reasons.length, written: origins.length + (blockedChanged ? 1 : 0) };
  }

  /** BND-01, BND-06, BND-08: the shop's bandwidth this cycle, its limit, and its days in order. */
  async usage(tenantId: string): Promise<BandwidthUsage> {
    const now = this.clock();
    const [shop, overrides] = await Promise.all([
      this.store.findBillingShop(tenantId),
      this.store.listShopOverrides(tenantId),
    ]);
    if (!shop) throw new Error(`no shop ${tenantId}`);
    const cycleStart = usageCycleStart(shop, now);
    const [cycle, days] = await Promise.all([
      this.store.findCycle(tenantId, cycleStart),
      this.store.listDays(tenantId, cycleStart),
    ]);
    return {
      cycleStart,
      usedBytes: cycle?.bytes ?? 0,
      requests: cycle?.requests ?? 0,
      limitBytes: limitBytes(shop.planSnapshot, overrides),
      days,
    };
  }

  /**
   * Adds one step's usage, summed by shop, cycle and day, and queues the notices now due with it, so a step that rolls
   * back tells no one (SCL-08). A shop deleted or never made has no bandwidth to add to.
   */
  private async add(
    tx: Transaction,
    usage: readonly MediaUsageTotal[],
    shops: ReadonlyMap<string, EdgeShopRow>,
    overrides: ReadonlyMap<string, LimitOverrideRow[]>,
    shares: readonly number[],
    now: Date,
  ): Promise<void> {
    const sums = new Map<string, DaySum>();
    for (const total of usage) {
      const shop = shops.get(total.tenantId);
      if (!shop || shop.deletedAt !== null) continue;
      const cycleStart = usageCycleStart(shop, total.minute);
      const day = dhakaDate(total.minute);
      const key = `${cycleKey(shop.id, cycleStart)}|${day}`;
      const sum = sums.get(key) ?? { shop, cycleStart, day, bytes: 0, requests: 0 };
      sums.set(key, {
        ...sum,
        bytes: sum.bytes + total.bytes,
        requests: sum.requests + total.requests,
      });
    }
    for (const { shop, cycleStart, day, bytes, requests } of sums.values()) {
      const row = await this.store.add(tx, { tenantId: shop.id, cycleStart, day, bytes, requests });
      // BND-05: warnings belong to the cycle running now; minutes caught up from an earlier one warn no one.
      if (cycleStart.getTime() !== usageCycleStart(shop, now).getTime()) continue;
      const limit = limitBytes(shop.planSnapshot, overrides.get(shop.id) ?? []);
      const reached = warningDue(row.bytes, limit, row.warnedPercent, shares);
      if (reached === null || limit === null) continue;
      await this.store.setWarned(tx, shop.id, cycleStart, reached);
      await this.notices.queue(tx, {
        tenantId: shop.id,
        metric: UsageMetric.Bandwidth,
        level: levelOf(reached),
        used: row.bytes,
        limit,
        cycleStart: cycleStart.toISOString(),
      });
    }
  }

  /**
   * BND-03 before LIF-07: a shop past its bandwidth and the grace after it is refused to everyone, the dashboard too;
   * an offline one (read-only, locked, archived, suspended, deleted) to everyone but the dashboard and the operator
   * console. Between 100 percent and the grace's end its media is still served while its owner is told.
   */
  private blockReason(
    shop: EdgeShopRow,
    usedBytes: number,
    overrides: readonly LimitOverrideRow[],
    gracePercent: number,
  ): MediaBlockReason | null {
    if (shop.deletedAt !== null) return 'offline';
    if (pastGrace(usedBytes, limitBytes(shop.planSnapshot, overrides), gracePercent)) {
      return 'bandwidth';
    }
    return CLOSED_STATES.has(shop.state) || shop.suspendedAt !== null ? 'offline' : null;
  }
}

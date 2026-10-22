import type {
  BandwidthCycleRow,
  BandwidthDayRow,
  BillingInfoRow,
  CyclePackFields,
  EdgeShopRow,
  TenantTotal,
  Transaction,
} from '@lytronix/db';

/** A limit override, as the minute's pass reads every shop's at once (PLN-11). */
export interface LimitOverrideRow {
  tenantId: string;
  limitKey: string;
  value: unknown;
}

/**
 * BND-01, BND-02, BND-05, BND-06, BND-08, MED-10, MED-13: each shop's media bandwidth per cycle and per day, how far the
 * media Worker's usage is totalled, and what the shared store is worked out from -- every shop, its bandwidth
 * overrides and its live API keys' websites.
 */
export interface BandwidthStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  lockPulledUntil(tx: Transaction): Promise<Date>;
  setPulledUntil(tx: Transaction, at: Date): Promise<void>;
  add(
    tx: Transaction,
    usage: { tenantId: string; cycleStart: Date; day: string; bytes: number; requests: number },
  ): Promise<BandwidthCycleRow>;
  setWarned(tx: Transaction, tenantId: string, cycleStart: Date, percent: number): Promise<void>;
  /** BND-04: changes the cycle's warning or pack figures. */
  updateCycle(
    tx: Transaction,
    tenantId: string,
    cycleStart: Date,
    values: Partial<CyclePackFields & { warnedPercent: number }>,
  ): Promise<void>;
  /** BND-04: the shop's cycle, made at nothing used if it has none yet, locked for a change to its packs. */
  lockCycle(tx: Transaction, tenantId: string, cycleStart: Date): Promise<BandwidthCycleRow>;
  /** PLN-13: every shop's active limit add-ons for its bandwidth, in GB -- or one shop's, in `tx` when given. */
  listLimitAddons(tenantId?: string, tx?: Transaction): Promise<TenantTotal[]>;
  /** BND-04: the bandwidth packs every shop bought, in GB -- or one shop's, in `tx` when given. */
  listPacksBought(tenantId?: string, tx?: Transaction): Promise<TenantTotal[]>;
  /** BND-04: what every shop's cycles took from its bandwidth packs, in bytes -- or one shop's. */
  listPacksTaken(tenantId?: string, tx?: Transaction): Promise<TenantTotal[]>;
  findCycle(tenantId: string, cycleStart: Date): Promise<BandwidthCycleRow | null>;
  listCyclesSince(since: Date): Promise<BandwidthCycleRow[]>;
  listDays(tenantId: string, cycleStart: Date): Promise<BandwidthDayRow[]>;
  /** Every shop not deleted, or deleted since this time. */
  listEdgeShops(deletedSince: Date): Promise<EdgeShopRow[]>;
  /** PLN-11: every shop's override of one limit. */
  listOverridesFor(limitKey: string): Promise<LimitOverrideRow[]>;
  /** PLN-11: one shop's overrides. */
  listShopOverrides(tenantId: string): Promise<LimitOverrideRow[]>;
  /** The shop's plan snapshot and what its billing cycle runs from. */
  findBillingShop(tenantId: string): Promise<BillingInfoRow | null>;
  listLiveWebsites(now: Date): Promise<{ tenantId: string; websites: string[] }[]>;
  /** LIF-19: a lapsed shop's bandwidth, at day 60. */
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}

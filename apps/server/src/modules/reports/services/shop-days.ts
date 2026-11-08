import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LedgerEntryType,
  SHOP_DAY_BACKFILL_DAYS,
  SPENT_LEDGER_TYPES,
  TenantState,
} from '@lytronix/validators';
import { DAY_MS, dhakaDate, dhakaDayStart } from '../../../common/time';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { MediaService } from '../../media/services/media.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { ShopDayStore } from '../ports/shop-day-store';
import { REPORTS_CLOCK, SHOP_DAY_STORE } from '../tokens';

/** What one night's run did. */
export interface ShopDayRunResult {
  shops: number;
  days: number;
}

/**
 * ADM-09, D8-9 (Phase 8 Slice 8.4, read agreed 2026-11-08): each night, every shop's day just ended -- its state and plan,
 * storage, SMS units, and what it spent from its balance by type -- recorded in a Lytro table, so the reports read
 * figures across shops without crossing any shop's row-level security. A day a missed night left out is filled in, up
 * to 7 days back; a state, plan or storage filled in later is the one found then. One shop's failure never stops the rest.
 */
@Injectable()
export class ShopDays {
  private readonly logger = new Logger(ShopDays.name);

  constructor(
    @Inject(SHOP_DAY_STORE) private readonly store: ShopDayStore,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(TenantSummaries) private readonly shops: TenantSummaries,
    @Inject(REPORTS_CLOCK) private readonly clock: () => Date,
  ) {}

  /** The night's run: the days up to yesterday (Dhaka) each shop is missing. */
  async run(): Promise<ShopDayRunResult> {
    const today = dhakaDate(this.clock());
    const days = Array.from({ length: SHOP_DAY_BACKFILL_DAYS }, (_, back) =>
      dhakaDate(new Date(dhakaDayStart(today).getTime() - (back + 1) * DAY_MS)),
    );
    const result: ShopDayRunResult = { shops: 0, days: 0 };
    for (const tenantId of await this.store.shopIds()) {
      try {
        const shop = await this.shops.findById(tenantId);
        if (!shop || shop.state === TenantState.Deleted) continue;
        const opened = dhakaDate(shop.createdAt);
        const done = await this.store.recorded(tenantId, days);
        const missing = days.filter((day) => day >= opened && !done.has(day));
        for (const day of missing) await this.recordDay(tenantId, day);
        result.shops += 1;
        result.days += missing.length;
      } catch (error) {
        this.logger.error(
          `a shop's day couldn't be recorded for tenant ${tenantId}`,
          error as Error,
        );
      }
    }
    return result;
  }

  /** Records one shop's Dhaka day, replacing any earlier record of it. */
  async recordDay(tenantId: string, day: string): Promise<void> {
    const shop = await this.shops.findById(tenantId);
    if (!shop) return;
    const from = dhakaDayStart(day);
    const to = new Date(from.getTime() + DAY_MS);
    const [storage, smsUnits, ledger] = await Promise.all([
      this.media.usage(tenantId),
      this.store.smsUnits(tenantId, from, to),
      this.store.ledgerTotals(tenantId, from, to),
    ]);
    // D8-40: only the charges for what shops buy from Lytro; a reversal is counted as given back.
    const spend: Partial<Record<LedgerEntryType, string>> = {};
    let givenBack = 0n;
    for (const row of ledger) {
      if (SPENT_LEDGER_TYPES.includes(row.type) && toPaisa(row.charged) > 0n)
        spend[row.type] = row.charged;
      if (row.type === LedgerEntryType.Reversal) givenBack += toPaisa(row.returned);
    }
    await this.store.record({
      tenantId,
      day,
      state: shop.state,
      planId: shop.planId,
      storageBytes: storage.usedBytes,
      smsUnits,
      spend,
      givenBack: fromPaisa(givenBack),
    });
  }
}

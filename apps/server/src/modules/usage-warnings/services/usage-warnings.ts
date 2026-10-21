import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { PlanLimits, UsageMetric } from '@lytronix/validators';
import { usageCycleStart } from '../../../common/time';
import { levelOf, warningDue } from '../../../common/usage-warnings';
import type { UsageNotices } from '../ports/usage-notices';
import type { UsageWarningStore } from '../ports/usage-warning-store';
import { USAGE_CLOCK, USAGE_NOTICES, USAGE_WARNING_STORE } from '../tokens';

/** One use of a limit, as the write that used it counts it. */
export interface LimitUse {
  tenantId: string;
  metric: UsageMetric;
  used: number;
  /** null is unlimited (PLN-19), and warns of nothing. */
  limit: number | null;
}

/**
 * LIM-01: warns a shop at 50, 80 and 95 percent of a limit its own actions use up -- products, seats, storage, free
 * SMS -- once each per cycle. Called in the transaction of the write that used it, so the record of what was sent and
 * the queued notice commit with it or not at all. Bandwidth and API requests decide their own (they also tell of
 * their limit and their stop) and queue through the same notices.
 */
@Injectable()
export class UsageWarnings {
  constructor(
    @Inject(USAGE_WARNING_STORE) private readonly store: UsageWarningStore,
    @Inject(USAGE_NOTICES) private readonly notices: UsageNotices,
    @Inject(USAGE_CLOCK) private readonly clock: () => Date,
  ) {}

  async check(tx: Transaction, use: LimitUse): Promise<void> {
    if (use.limit === null) return;
    const shop = await this.store.findShop(use.tenantId);
    if (!shop) return;
    const cycleStart = usageCycleStart(shop, this.clock());
    const warned = await this.store.warned(tx, use.tenantId, use.metric, cycleStart);
    const reached = warningDue(use.used, use.limit, warned);
    if (reached === null) return;
    await this.store.setWarned(tx, use.tenantId, use.metric, cycleStart, reached);
    await this.notices.queue(tx, {
      tenantId: use.tenantId,
      metric: use.metric,
      level: levelOf(reached),
      used: use.used,
      limit: use.limit,
      cycleStart: cycleStart.toISOString(),
    });
  }

  /** PLN-11: the shop's own limits, for a counter that holds none of its own (the essential-SMS count). */
  async limitsOf(tenantId: string): Promise<PlanLimits | null> {
    return (await this.store.findShop(tenantId))?.limits ?? null;
  }

  /** LIF-19: the day-60 deletion takes a shop's warnings with the rest. */
  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.deleteForTenant(tenantId);
  }
}

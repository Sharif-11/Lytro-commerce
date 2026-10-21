import { Inject, Injectable } from '@nestjs/common';
import { UsageMetric } from '@lytronix/validators';
import { usageCycleEnd, usageCycleStart } from '../../../common/time';
import { pastGrace, USAGE_WARNINGS } from '../../../common/usage-warnings';
import { ProductService } from '../../catalogue/services/product.service';
import { MediaBandwidth } from '../../media/services/media-bandwidth';
import { MediaService } from '../../media/services/media.service';
import { RequestQuota } from '../../public-api/services/request-quota';
import { EssentialSmsUsageService } from '../../sms-usage/services/essential-sms-usage.service';
import { StaffService } from '../../staff/services/staff.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import { UsageSettings } from '../../usage-warnings/services/usage-settings';
import type { ShopUsage, UsageFigure } from '../types/usage';
import { metricLimit, SERVING_METRICS } from './metric-limits';
import { UsageSuggestions } from './usage-suggestions';

// LIM-01: the shares a figure's banner shows, its limit the last.
const BANNER_SHARES = [...USAGE_WARNINGS, 100] as const;

/** LIM-01: the highest share a figure has reached, or its stop past the grace; null below half or when unlimited. */
function levelOf(figure: Omit<UsageFigure, 'level'>, gracePercent: number): UsageFigure['level'] {
  if (figure.limit === null || figure.limit === 0) return null;
  if (SERVING_METRICS.has(figure.metric) && pastGrace(figure.used, figure.limit, gracePercent)) {
    return 'stopped';
  }
  const limit = figure.limit;
  return BANNER_SHARES.filter((share) => figure.used * 100 >= limit * share).pop() ?? null;
}

/**
 * LIM-01, LIM-02, PLN-19: every metric the platform counts today, against the shop's own limits -- its snapshot with
 * its overrides, the same ones every check reads -- with how near each is, and what would give the shop room. Orders
 * and payment sessions join with Phases 4 and 5.
 */
@Injectable()
export class UsageService {
  constructor(
    @Inject(ProductService) private readonly products: ProductService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(MediaBandwidth) private readonly bandwidth: MediaBandwidth,
    @Inject(RequestQuota) private readonly requests: RequestQuota,
    @Inject(EssentialSmsUsageService) private readonly sms: EssentialSmsUsageService,
    @Inject(UsageSettings) private readonly settings: UsageSettings,
    @Inject(UsageSuggestions) private readonly suggestions: UsageSuggestions,
  ) {}

  async usage(tenant: TenantSummary, now: Date): Promise<ShopUsage> {
    const limits = tenant.planLimits;
    const cycleStart = usageCycleStart(tenant, now);
    const [products, seats, storage, bandwidth, requests, sms, fastSpend, grace] =
      await Promise.all([
        this.products.liveCount(tenant.id),
        this.staff.seatsUsed(tenant.id),
        this.media.usage(tenant.id),
        this.bandwidth.usage(tenant.id),
        this.requests.used(tenant.id, cycleStart, now),
        this.sms.currentUsage(tenant.id, now),
        this.requests.fastSpendAlertedAt(tenant.id, cycleStart),
        this.settings.gracePercent(),
      ]);
    const figure = (
      metric: UsageMetric,
      used: number,
      unit: UsageFigure['unit'],
      perCycle: boolean,
    ): UsageFigure => {
      const counted = { metric, used, limit: metricLimit(limits, metric), unit, perCycle };
      return { ...counted, level: levelOf(counted, grace) };
    };
    const metrics: UsageFigure[] = [
      figure(UsageMetric.Products, products, 'count', false),
      figure(UsageMetric.Seats, seats, 'count', false),
      figure(UsageMetric.Storage, storage.usedBytes, 'bytes', false),
      figure(UsageMetric.Bandwidth, bandwidth.usedBytes, 'bytes', true),
      figure(UsageMetric.Requests, requests, 'count', true),
    ];
    // TRL-03, AUTH-21: a trial's free SMS is a total, a paid plan's a monthly allowance -- whichever the limits set.
    const total = limits?.essential_sms_total !== undefined;
    if (total) metrics.push(figure(UsageMetric.EssentialSmsTotal, sms.total, 'count', false));
    if (!total || limits.essential_sms_monthly !== undefined) {
      metrics.push(figure(UsageMetric.EssentialSmsMonthly, sms.monthly, 'count', true));
    }
    return {
      cycleStart,
      cycleEnd: usageCycleEnd(tenant, now),
      metrics,
      bandwidthDays: bandwidth.days,
      suggestions: await this.suggestions.for(tenant, metrics),
      fastSpendAlertedAt: fastSpend,
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { limitOf, UsageMetric } from '@lytronix/validators';
import { usageCycleEnd, usageCycleStart } from '../../../common/time';
import { ProductService } from '../../catalogue/services/product.service';
import { MediaBandwidth, GB } from '../../media/services/media-bandwidth';
import { MB } from '../../media/services/media-limits';
import { MediaService } from '../../media/services/media.service';
import { RequestQuota } from '../../public-api/services/request-quota';
import { EssentialSmsUsageService } from '../../sms-usage/services/essential-sms-usage.service';
import { StaffService } from '../../staff/services/staff.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import type { ShopUsage, UsageFigure } from '../types/usage';

/** A limit in MB or GB as bytes; null stays unlimited. */
function bytesOf(limit: number | null, unit: number): number | null {
  return limit === null ? null : limit * unit;
}

/**
 * LIM-02, PLN-19: every metric the platform counts today, against the shop's own limits -- its snapshot with its
 * overrides, the same ones every check reads. Orders and payment sessions join with Phases 4 and 5.
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
  ) {}

  async usage(tenant: TenantSummary, now: Date): Promise<ShopUsage> {
    const limits = tenant.planLimits;
    const cycleStart = usageCycleStart(tenant, now);
    const [products, seats, storage, bandwidth, requests, sms] = await Promise.all([
      this.products.liveCount(tenant.id),
      this.staff.seatsUsed(tenant.id),
      this.media.usage(tenant.id),
      this.bandwidth.usage(tenant.id),
      this.requests.used(tenant.id, cycleStart, now),
      this.sms.currentUsage(tenant.id, now),
    ]);
    const count = (metric: UsageMetric, used: number, limit: number | null, perCycle: boolean) =>
      ({ metric, used, limit, unit: 'count', perCycle }) satisfies UsageFigure;
    const metrics: UsageFigure[] = [
      count(UsageMetric.Products, products, limitOf(limits, 'products'), false),
      count(UsageMetric.Seats, seats, limitOf(limits, 'staff'), false),
      {
        metric: UsageMetric.Storage,
        used: storage.usedBytes,
        limit: bytesOf(limitOf(limits, 'storage_mb'), MB),
        unit: 'bytes',
        perCycle: false,
      },
      {
        metric: UsageMetric.Bandwidth,
        used: bandwidth.usedBytes,
        limit: bytesOf(limitOf(limits, 'bandwidth_gb'), GB),
        unit: 'bytes',
        perCycle: true,
      },
      count(UsageMetric.Requests, requests, limitOf(limits, 'requests_monthly'), true),
    ];
    // TRL-03, AUTH-21: a trial's free SMS is a total, a paid plan's a monthly allowance -- whichever the limits set.
    const total = limits?.essential_sms_total !== undefined;
    if (total) {
      metrics.push(
        count(
          UsageMetric.EssentialSmsTotal,
          sms.total,
          limitOf(limits, 'essential_sms_total'),
          false,
        ),
      );
    }
    if (!total || limits.essential_sms_monthly !== undefined) {
      metrics.push(
        count(
          UsageMetric.EssentialSmsMonthly,
          sms.monthly,
          limitOf(limits, 'essential_sms_monthly'),
          true,
        ),
      );
    }
    return {
      cycleStart,
      cycleEnd: usageCycleEnd(tenant, now),
      metrics,
      bandwidthDays: bandwidth.days,
    };
  }
}

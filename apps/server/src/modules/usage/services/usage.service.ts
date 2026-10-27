import { Inject, Injectable } from '@nestjs/common';
import { AddonKind, PackAutoBuyState, UsageMetric } from '@lytronix/validators';
import { usageCycleEnd, usageCycleStart } from '../../../common/time';
import {
  allowanceOf,
  NO_PACKS,
  packTaken,
  USAGE_WARNINGS,
  type CyclePacks,
} from '../../../common/usage-warnings';
import { AddonPurchaseService } from '../../billing/services/addon-purchase.service';
import type { AddonOffer } from '../../billing/types/addon';
import { ProductService } from '../../catalogue/services/product.service';
import { MediaBandwidth } from '../../media/services/media-bandwidth';
import { MediaService } from '../../media/services/media.service';
import { RequestQuota } from '../../public-api/services/request-quota';
import { EssentialSmsUsageService } from '../../sms-usage/services/essential-sms-usage.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import { UsageSettings } from '../../usage-warnings/services/usage-settings';
import type { ShopUsage, UsageFigure, UsagePack } from '../types/usage';
import { metricLimit, SERVING_METRICS } from './metric-limits';
import { runOutDate } from './pace';
import { UsageSuggestions } from './usage-suggestions';

// LIM-01: the shares a figure's banner shows, its limit the last.
const BANNER_SHARES = [...USAGE_WARNINGS, 100] as const;

/** LIM-01: the highest share a figure has reached, or its stop past the grace; null below half or when unlimited. */
function levelOf(figure: Omit<UsageFigure, 'level'>): UsageFigure['level'] {
  if (figure.limit === null || figure.limit === 0) return null;
  if (figure.stopAt !== null && figure.used >= figure.stopAt) return 'stopped';
  const limit = figure.limit;
  return BANNER_SHARES.filter((share) => figure.used * 100 >= limit * share).pop() ?? null;
}

/** BND-04, RTE-11: the pack for sale that tops up this limit, and its price -- or null when the shop cannot buy one. */
function packOffer(offers: readonly AddonOffer[], limitKey: string): UsagePack['offer'] {
  const offer = offers.find(
    ({ addon, price }) =>
      addon.kind === AddonKind.Pack && addon.limitKey === limitKey && price !== null,
  );
  return offer?.price != null
    ? { addonId: offer.addon.id, name: offer.addon.labelEn, price: offer.price }
    : null;
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
    @Inject(AddonPurchaseService) private readonly addons: AddonPurchaseService,
    @Inject(TenantService) private readonly tenants: TenantService,
  ) {}

  async usage(tenant: TenantSummary, now: Date): Promise<ShopUsage> {
    const limits = tenant.planLimits;
    const cycleStart = usageCycleStart(tenant, now);
    const [
      products,
      seats,
      storage,
      bandwidth,
      requests,
      requestDays,
      requestPacks,
      sms,
      fastSpend,
      grace,
    ] = await Promise.all([
      this.products.liveCount(tenant.id),
      this.staff.seatsUsed(tenant.id),
      this.media.usage(tenant.id),
      this.bandwidth.usage(tenant.id),
      this.requests.used(tenant.id, cycleStart, now),
      this.requests.days(tenant.id, cycleStart),
      this.requests.packsOf(tenant.id, cycleStart),
      this.sms.currentUsage(tenant.id, now),
      this.requests.fastSpendAlertedAt(tenant.id, cycleStart),
      this.settings.gracePercent(),
    ]);
    const [offers, billing] = await Promise.all([
      this.addons.offers(tenant.id),
      this.tenants.runStandalone((tx) => this.tenants.findBillingInfo(tx, tenant.id)),
    ]);
    const cycleEnd = usageCycleEnd(tenant, now);
    const figure = (
      metric: UsageMetric,
      used: number,
      unit: UsageFigure['unit'],
      perCycle: boolean,
      packs: CyclePacks | null = null,
    ): UsageFigure => {
      const own = metricLimit(limits, metric);
      const allowance = allowanceOf(own, packs ?? NO_PACKS);
      const serving = SERVING_METRICS.has(metric);
      // LIM-01 (Slice 11.5c): the email's own figure, while the allowance is not used up yet and runs out in the cycle.
      const runsOut =
        serving && allowance !== null && used < allowance
          ? runOutDate(used, allowance, cycleStart, now)
          : null;
      const counted = {
        metric,
        used,
        limit: allowance,
        unit,
        perCycle,
        packLeft: packs ? packs.available - packTaken(used, own, packs) : null,
        // BND-03, RTE-03: the grace after the allowance is a share of the shop's own limit.
        stopAt:
          serving && own !== null && allowance !== null ? allowance + (own * grace) / 100 : null,
        runsOutAt: runsOut !== null && runsOut < cycleEnd ? runsOut : null,
      };
      return { ...counted, level: levelOf(counted) };
    };
    const metrics: UsageFigure[] = [
      figure(UsageMetric.Products, products, 'count', false),
      figure(UsageMetric.Seats, seats, 'count', false),
      figure(UsageMetric.Storage, storage.usedBytes, 'bytes', false),
      figure(UsageMetric.Bandwidth, bandwidth.usedBytes, 'bytes', true, bandwidth.packs),
      figure(UsageMetric.Requests, requests, 'count', true, requestPacks.packs),
    ];
    const packs: UsagePack[] = [
      {
        metric: UsageMetric.Bandwidth,
        offer: packOffer(offers, 'bandwidth_gb'),
        autoBuy: bandwidth.autoBuy,
        autoPacks: bandwidth.autoPacks,
        autoBuyFailed: bandwidth.autoBuyState === PackAutoBuyState.Failed,
      },
      {
        metric: UsageMetric.Requests,
        offer: packOffer(offers, 'requests_monthly'),
        autoBuy: billing?.autoBuyRequests ?? false,
        autoPacks: requestPacks.autoPacks,
        autoBuyFailed: requestPacks.autoBuyState === PackAutoBuyState.Failed,
      },
    ];
    // TRL-03, AUTH-21: a trial's free SMS is a total, a paid plan's a monthly allowance -- whichever the limits set.
    const total = limits?.essential_sms_total !== undefined;
    if (total) metrics.push(figure(UsageMetric.EssentialSmsTotal, sms.total, 'count', false));
    if (!total || limits.essential_sms_monthly !== undefined) {
      metrics.push(figure(UsageMetric.EssentialSmsMonthly, sms.monthly, 'count', true));
    }
    return {
      cycleStart,
      cycleEnd,
      metrics,
      bandwidthDays: bandwidth.days,
      requestDays,
      suggestions: await this.suggestions.for(tenant, metrics, offers, now),
      fastSpendAlertedAt: fastSpend,
      packs,
    };
  }
}

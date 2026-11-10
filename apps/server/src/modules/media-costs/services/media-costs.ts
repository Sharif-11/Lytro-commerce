import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CloudflarePrices, MediaCostsQuery } from '@lytronix/validators';
import { MailService } from '../../shared/mail/services/mail.service';
import type { MediaCostStore, RecordedR2Day } from '../ports/media-cost-store';
import type { R2Usage } from '../ports/r2-usage';
import { MEDIA_COST_STORE, MEDIA_COSTS_CLOCK, R2_USAGE } from '../tokens';
import {
  addDays,
  daysOf,
  estimateOf,
  gbMonthsOf,
  periodBefore,
  periodOf,
  usd,
  utcDay,
  type BillingPeriod,
  type MediaCostEstimate,
} from './media-cost-estimate';
import { MediaCostSettings } from './media-cost-settings';

// Cloudflare's adaptive datasets keep at least 31 days, and a billing period is never longer, so every day asked for
// is still there. A day's figures can still grow for a while after it ends, so the last few are read again each hour.
const SETTLING_DAYS = 3;
// D8-64: the shops shown, by the media Worker's requests.
const TOP_SHOPS = 10;
// The periods the console can step back through.
const PERIODS_SHOWN = 12;

/** One bucket's figures over a period. */
export interface MediaCostBucket {
  bucket: string;
  classA: number;
  classB: number;
  freeOps: number;
  gbMonths: number;
  /** Its storage on the latest day recorded, in bytes, and the objects then. */
  latestBytes: number;
  objects: number;
}

interface CostLine {
  operations: number;
  billableMillions: number;
  cost: string;
}

/** MED-12: the operator's media costs page for one billing period. */
export interface MediaCostsView {
  period: { dateFrom: string; dateTo: string; days: number; daysRecorded: number };
  connected: boolean;
  /** When the period's figures were last read from Cloudflare. */
  readAt: string | null;
  budget: {
    amount: string;
    alertPercent: number;
    alertAt: string;
    usedPercent: number;
    alertEmail: string | null;
    alertSentAt: string | null;
  };
  r2: {
    classA: CostLine;
    classB: CostLine;
    storage: { gbMonths: number; billableGbMonths: number; cost: string };
    cost: string;
    buckets: MediaCostBucket[];
  };
  workers: {
    requests: number;
    bytes: number;
    billableMillions: number;
    monthly: string;
    cost: string;
  };
  total: string;
  topShops: { tenantId: string; name: string; slug: string; requests: number; bytes: number }[];
  periods: { dateFrom: string; dateTo: string }[];
  prices: CloudflarePrices;
}

/** A period's last day, as the Dhaka days of the shops' bandwidth are counted (D8-64). */
function lastDayOf(period: BillingPeriod): string {
  return addDays(period.to, -1);
}

function bucketsOf(days: readonly RecordedR2Day[]): MediaCostBucket[] {
  const byName = new Map<string, RecordedR2Day[]>();
  for (const day of days) byName.set(day.bucket, [...(byName.get(day.bucket) ?? []), day]);
  return [...byName.entries()]
    .map(([bucket, rows]) => {
      const latest = rows.reduce((last, row) => (row.day > last.day ? row : last));
      return {
        bucket,
        classA: rows.reduce((sum, row) => sum + row.classA, 0),
        classB: rows.reduce((sum, row) => sum + row.classB, 0),
        freeOps: rows.reduce((sum, row) => sum + row.freeOps, 0),
        gbMonths: Math.round(gbMonthsOf(rows) * 1000) / 1000,
        latestBytes: latest.peakBytes,
        objects: latest.objects,
      };
    })
    .sort((a, b) => b.latestBytes - a.latestBytes || a.bucket.localeCompare(b.bucket));
}

/**
 * MED-12, D8-17, D8-57 to D8-64 (Phase 8 Slice 8.6, read agreed 2026-11-10): what Cloudflare will bill Lytro for its
 * media. Each hour reads R2's recent days from Cloudflare's own analytics (every bucket, the whole bill), adds the
 * media Worker's requests the server already counts, and holds the period's estimate against the budget, emailing the
 * one alert address once a period when it reaches the alert's percent.
 */
@Injectable()
export class MediaCosts {
  private readonly logger = new Logger('MediaCosts');

  constructor(
    @Inject(R2_USAGE) private readonly usage: R2Usage,
    @Inject(MEDIA_COST_STORE) private readonly store: MediaCostStore,
    @Inject(MediaCostSettings) private readonly settings: MediaCostSettings,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(MEDIA_COSTS_CLOCK) private readonly clock: () => Date,
  ) {}

  /** The hour's pass: reads the days still missing from this period and the last few again, then the alert. */
  async pull(now: Date = this.clock()): Promise<{ days: number; rows: number; alerted: boolean }> {
    if (!this.usage.connected) return { days: 0, rows: 0, alerted: false };
    const period = periodOf(now, await this.settings.billingDay());
    const today = utcDay(now);
    const recorded = new Set(
      (await this.store.daysBetween(period.from, addDays(today, 1))).map((row) => row.day),
    );
    const wanted = new Set<string>();
    for (let day = period.from; day <= today; day = addDays(day, 1)) {
      if (!recorded.has(day)) wanted.add(day);
    }
    // The last days again, the period before's last ones among them on a period's first days.
    for (let back = 0; back < SETTLING_DAYS; back += 1) wanted.add(addDays(today, -back));
    const days = [...wanted].sort();
    const rows = await this.usage.days(days);
    await this.store.replaceDays(days, rows);
    const alerted = await this.alertIfDue(period);
    return { days: days.length, rows: rows.length, alerted };
  }

  /** The operator's page: the period holding `query.period`, or the one running now. */
  async view(query: MediaCostsQuery, now: Date = this.clock()): Promise<MediaCostsView> {
    const billingDay = await this.settings.billingDay();
    const period = periodOf(query.period ? new Date(`${query.period}T00:00:00Z`) : now, billingDay);
    const [figures, budget, alertPercent, alertEmail, alert, top, span] = await Promise.all([
      this.figures(period),
      this.settings.budgetUsd(),
      this.settings.alertPercent(),
      this.settings.alertEmail(),
      this.store.alertOf(period.from),
      this.store.topShops(period.from, lastDayOf(period), TOP_SHOPS),
      this.store.recordedSpan(),
    ]);
    const { estimate, days, worker, prices } = figures;
    const readAt = days.reduce<Date | null>(
      (latest, day) => (latest === null || day.updatedAt > latest ? day.updatedAt : latest),
      null,
    );
    const line = (cost: {
      operations: number;
      billableMillions: number;
      cost: number;
    }): CostLine => ({
      operations: cost.operations,
      billableMillions: cost.billableMillions,
      cost: usd(cost.cost),
    });
    return {
      period: {
        dateFrom: period.from,
        dateTo: lastDayOf(period),
        days: daysOf(period),
        daysRecorded: new Set(days.map((day) => day.day)).size,
      },
      connected: this.usage.connected,
      readAt: readAt?.toISOString() ?? null,
      budget: {
        amount: usd(budget),
        alertPercent,
        alertAt: usd((budget * alertPercent) / 100),
        usedPercent: budget > 0 ? Math.round((estimate.total / budget) * 100) : 0,
        alertEmail,
        alertSentAt: alert?.sentAt.toISOString() ?? null,
      },
      r2: {
        classA: line(estimate.classA),
        classB: line(estimate.classB),
        storage: {
          gbMonths: Math.round(estimate.storage.gbMonths * 1000) / 1000,
          billableGbMonths: estimate.storage.billableGbMonths,
          cost: usd(estimate.storage.cost),
        },
        cost: usd(estimate.r2),
        buckets: bucketsOf(days),
      },
      workers: {
        requests: worker.requests,
        bytes: worker.bytes,
        billableMillions: estimate.workers.billableMillions,
        monthly: usd(estimate.workers.monthly),
        cost: usd(estimate.workers.cost),
      },
      total: usd(estimate.total),
      topShops: top,
      periods: this.periodsTo(periodOf(now, billingDay), span?.first ?? null, billingDay),
      prices,
    };
  }

  private async figures(period: BillingPeriod): Promise<{
    estimate: MediaCostEstimate;
    days: RecordedR2Day[];
    worker: { requests: number; bytes: number };
    prices: CloudflarePrices;
  }> {
    const [days, worker, prices] = await Promise.all([
      this.store.daysBetween(period.from, period.to),
      this.store.workerUse(period.from, lastDayOf(period)),
      this.settings.prices(),
    ]);
    return { estimate: estimateOf(days, worker.requests, prices), days, worker, prices };
  }

  /** The current period and those before it back to the first recorded day, newest first. */
  private periodsTo(
    current: BillingPeriod,
    first: string | null,
    billingDay: number,
  ): { dateFrom: string; dateTo: string }[] {
    const periods: BillingPeriod[] = [current];
    while (first !== null && periods.length < PERIODS_SHOWN) {
      const last = periods[periods.length - 1];
      if (!last || last.from <= first) break;
      periods.push(periodBefore(last, billingDay));
    }
    return periods.map((period) => ({ dateFrom: period.from, dateTo: lastDayOf(period) }));
  }

  /** MED-12, D8-63: once a period, when the estimate reaches the alert's share of the budget. */
  private async alertIfDue(period: BillingPeriod): Promise<boolean> {
    const [{ estimate }, budget, alertPercent] = await Promise.all([
      this.figures(period),
      this.settings.budgetUsd(),
      this.settings.alertPercent(),
    ]);
    const alertAt = (budget * alertPercent) / 100;
    if (estimate.total < alertAt) return false;
    if (await this.store.alertOf(period.from)) return false;
    const email = await this.settings.alertEmail();
    if (email === null) {
      this.logger.warn(
        `media costs at $${usd(estimate.total)} of a $${usd(budget)} budget, but no alert address is set`,
      );
      return false;
    }
    const lastDay = lastDayOf(period);
    const subject = `Lytro's Cloudflare costs reached ${String(Math.round((estimate.total / budget) * 100))}% of the budget`;
    const body = [
      `Lytro's Cloudflare costs for ${period.from} to ${lastDay} are about $${usd(estimate.total)} so far,`,
      `past ${String(alertPercent)}% of the $${usd(budget)} budget.`,
      '',
      `R2: $${usd(estimate.r2)} (writes $${usd(estimate.classA.cost)}, reads $${usd(estimate.classB.cost)}, storage $${usd(estimate.storage.cost)}).`,
      `Workers: $${usd(estimate.workers.cost)}, with ${String(estimate.workers.requests)} media requests.`,
      '',
      "The console's media costs page shows each bucket and the shops that use most.",
      'This is the only alert for this period.',
    ].join('\n');
    return this.store.run(async (tx) => {
      const fresh = await this.store.recordAlert(tx, {
        periodStart: period.from,
        sentTo: email,
        estimate: usd(estimate.total),
        budget: usd(budget),
      });
      if (!fresh) return false;
      await this.mail.queueLifecycleNotice(tx, email, subject, body);
      return true;
    });
  }
}

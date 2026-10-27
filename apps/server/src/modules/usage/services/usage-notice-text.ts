import { PACK_AUTO_BUY_CAP, UsageMetric } from '@lytronix/validators';
import { DAY_MS } from '../../../common/time';
import type { UsageNotice } from '../../usage-warnings/types/usage-notice';
import { GB } from '../../media/services/media-bandwidth';
import { MB } from '../../media/services/media-limits';
import type { ShopUsage, Suggestion, Suggestions } from '../types/usage';
import { SERVING_METRICS } from './metric-limits';
import { runOutDate } from './pace';

/** One notice as the owner reads it: by email, and the short form an SMS carries. */
export interface NoticeText {
  subject: string;
  body: string;
  sms: string;
}

// LIM-01: what each metric is called in a notice.
const NAMES: Readonly<Record<UsageMetric, string>> = {
  [UsageMetric.Products]: 'products',
  [UsageMetric.Seats]: 'seats',
  [UsageMetric.Storage]: 'media storage',
  [UsageMetric.Bandwidth]: 'media bandwidth',
  [UsageMetric.Requests]: 'API requests',
  [UsageMetric.EssentialSmsMonthly]: 'free SMS this month',
  [UsageMetric.EssentialSmsTotal]: 'free SMS',
};

// What stops for shoppers when a metric that serves them is used up (BND-03, RTE-03).
const SERVED: Partial<Record<UsageMetric, { what: string; stopped: string }>> = {
  [UsageMetric.Bandwidth]: {
    what: 'images and videos are still shown',
    stopped: 'images and videos have stopped showing',
  },
  [UsageMetric.Requests]: {
    what: 'catalogue still answers your website and storefront',
    stopped: 'catalogue has stopped answering your website and storefront',
  },
};

/** A figure as a notice writes it: bytes in GB or MB, by the size of the limit they are read against. */
function amount(metric: UsageMetric, value: number, limit: number): string {
  if (metric !== UsageMetric.Storage && metric !== UsageMetric.Bandwidth) return String(value);
  return limit >= GB ? `${(value / GB).toFixed(1)} GB` : `${String(Math.round(value / MB))} MB`;
}

function day(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Dhaka',
  });
}

function option(suggestion: Suggestion): string {
  if (suggestion.kind === 'contact') return 'contact Lytro for a custom plan';
  if (suggestion.kind === 'addons') {
    const items = suggestion.items
      .map((item) =>
        item.quantity === 1
          ? `the ${item.name} add-on`
          : `${String(item.quantity)} ${item.name} add-ons`,
      )
      .join(' and ');
    return `add ${items} to your plan, ${String(suggestion.monthly)} TK a month`;
  }
  const term = suggestion.months === 1 ? 'a month' : `${String(suggestion.months)} months`;
  const monthly = suggestion.months === 1 ? '' : ` (${String(suggestion.monthly)} TK a month)`;
  return `${suggestion.name}, ${String(suggestion.price)} TK for ${term}${monthly}`;
}

/**
 * BND-04, RTE-11, PLN-15: what the notice at the allowance or the stop says of packs -- the one-tap pack and auto-buy,
 * or what auto-buy is doing, or why it could not.
 */
function packLine(notice: UsageNotice, usage: ShopUsage): string {
  const pack = usage.packs.find((each) => each.metric === notice.metric);
  if (!pack) return '';
  const offer = pack.offer;
  if (pack.autoBuy) {
    if (pack.autoBuyFailed) {
      return ' Auto-buy could not buy a pack: your balance is too short. Top up to buy one.';
    }
    if (pack.autoPacks >= PACK_AUTO_BUY_CAP) {
      return ` Auto-buy has already bought its ${String(PACK_AUTO_BUY_CAP)} packs this cycle.`;
    }
    return offer
      ? ` Auto-buy is buying a ${offer.name} for ${String(offer.price)} TK from your balance.`
      : '';
  }
  return offer
    ? ` Buy a ${offer.name} for ${String(offer.price)} TK from your dashboard in one tap, or switch on auto-buy.`
    : '';
}

/** LIM-01: the cheapest fix and the alternative, in a sentence; nothing when no metric is near its limit. */
function roomLine(suggestions: Suggestions | null): string {
  if (!suggestions) return '';
  const first = option(suggestions.first);
  const rest = suggestions.alternative ? `, or ${option(suggestions.alternative)}` : '';
  return ` For more room: ${first}${rest}.`;
}

/** LIM-01: when a per-cycle metric runs out at the pace of the cycle so far, or that it lasts the cycle. */
function paceLine(notice: UsageNotice, usage: ShopUsage, now: Date): string {
  const runsOut = runOutDate(notice.used, notice.limit, usage.cycleStart, now);
  if (!runsOut) return '';
  if (runsOut >= usage.cycleEnd) {
    return ` At this cycle's pace it lasts until the cycle ends on ${day(usage.cycleEnd)}.`;
  }
  const days = Math.max(Math.round((runsOut.getTime() - now.getTime()) / DAY_MS), 1);
  return ` At this cycle's pace it runs out in about ${String(days)} day${days === 1 ? '' : 's'}, around ${day(runsOut)}.`;
}

/**
 * LIM-01, BND-05, RTE-03, RTE-12: the words of a usage notice -- how much is used, what happens to shoppers at a limit
 * that serves them, when it runs out, and what would give room (the cheapest fix and one alternative). In English, as
 * every platform notice is today; ASCII only, so an SMS is one plain part.
 */
export function noticeText(
  notice: UsageNotice,
  shopName: string,
  usage: ShopUsage,
  now: Date,
  gracePercent: number,
): NoticeText {
  const name = NAMES[notice.metric];
  const used = amount(notice.metric, notice.used, notice.limit);
  const limit = amount(notice.metric, notice.limit, notice.limit);
  const room = roomLine(usage.suggestions);
  const served = SERVED[notice.metric];
  const resets = day(usage.cycleEnd);
  if (notice.level === 'fast_spend') {
    const share = Math.round((notice.used * 100) / notice.limit);
    return {
      subject: `${shopName}: ${used} API requests in one hour`,
      body:
        `${shopName} made ${used} API requests in one hour, ${String(share)}% of the ${limit} its cycle allows. ` +
        'Nothing is refused, but the cycle is spent that much faster. If that was not your shoppers, someone may be ' +
        'copying your catalogue: tell Lytro support and we will look into it.',
      sms: `Lytro: ${shopName} made ${used} API requests in one hour. Check your dashboard.`,
    };
  }
  const packs = served ? packLine(notice, usage) : '';
  if (notice.level === 'stopped' && served) {
    return {
      subject: `${shopName}: your ${served.stopped}`,
      body:
        `${shopName} has used its ${name} for this cycle (${limit}) and the ${String(gracePercent)}% after it, so its ` +
        `${served.stopped}. They come back when the cycle ends on ${resets}, or as soon as it has more room.` +
        `${packs}${room}`,
      sms: `Lytro: ${shopName}'s ${served.stopped}: its ${name} is used up. Get more room from your dashboard.`,
    };
  }
  if (notice.level === 100 && served) {
    // BND-03, RTE-03: the grace is a share of the shop's own limit, so with packs it is a smaller share of the allowance.
    const stopAt =
      usage.metrics.find((figure) => figure.metric === notice.metric)?.stopAt ??
      (notice.limit * (100 + gracePercent)) / 100;
    const until = amount(notice.metric, Math.floor(stopAt), notice.limit);
    const upTo = Math.round((stopAt * 100) / notice.limit);
    return {
      subject: `${shopName}: your ${name} is used up`,
      body:
        `${shopName} has used all ${limit} of its ${name} for this cycle. Its ${served.what} for now, up to ` +
        `${until}; then they stop until the cycle ends on ${resets}, unless it has more room.${packs}${room}`,
      sms:
        `Lytro: ${shopName} has used all its ${name}. It keeps working up to ${String(upTo)}%, ` +
        'then stops. Get more room from your dashboard.',
    };
  }
  const percent = notice.level === 'stopped' ? 100 : notice.level;
  const pace = SERVING_METRICS.has(notice.metric) ? paceLine(notice, usage, now) : '';
  return {
    subject: `${shopName}: ${String(percent)}% of your ${name} used`,
    body: `${shopName} has used ${used} of its ${limit} ${name} (${String(percent)}%).${pace}${room}`,
    sms: `Lytro: ${shopName} has used ${String(percent)}% of its ${name}. Get more room from your dashboard.`,
  };
}

/** RTE-12: the operators' copy of a fast-spend alert. */
export function operatorAlertText(
  notice: UsageNotice,
  shop: { shopName: string; slug: string },
): { subject: string; body: string } {
  const share = Math.round((notice.used * 100) / notice.limit);
  return {
    subject: `Fast API spending: ${shop.slug}`,
    body:
      `${shop.shopName} (${shop.slug}) made ${String(notice.used)} API requests in one hour, ${String(share)}% of the ` +
      `${String(notice.limit)} its cycle allows. Nothing was refused. If it is an attack, its monthly quota can be ` +
      'raised for it with an override (PLN-11).',
  };
}

/**
 * LIM-01 (agreed for Slice 10): which notices also go by SMS -- the platform pays. Only bandwidth and API requests, which
 * stop shoppers: at 100 percent and at the stop always, and at 95 percent to an owner with no email.
 */
export function smsDue(notice: UsageNotice, ownerHasEmail: boolean): boolean {
  if (!SERVING_METRICS.has(notice.metric)) return false;
  if (notice.level === 100 || notice.level === 'stopped') return true;
  return notice.level === 95 && !ownerHasEmail;
}

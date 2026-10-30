import { AddonKind, PACK_AUTO_BUY_CAP, UsageMetric } from '@lytronix/validators';
import { formatTaka } from '@lytronix/ui';
import { dayKey, formatDayMonth } from '@/lib/dates';
import { usageSize } from '@/lib/limits';
import type { Addon, AddonOffer } from '@/types/addons';
import type { ShopUsage, UsageFigure, UsagePack } from '@/types/usage';

type T = (key: string, options?: Record<string, unknown>) => string;

/** A metric with packs, the ones that serve shoppers (BND-03, RTE-03). */
export type PackMetric = UsageMetric.Bandwidth | UsageMetric.Requests;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The metrics that serve shoppers: past the allowance they keep serving to the grace, then stop (BND-03, RTE-03). */
export function isServing(metric: UsageMetric): metric is PackMetric {
  return metric === UsageMetric.Bandwidth || metric === UsageMetric.Requests;
}

/** Each metric's name, as its card and its banner say it. */
export const METRIC_KEY: Readonly<Record<UsageMetric, string>> = {
  [UsageMetric.Products]: 'uProducts',
  [UsageMetric.Seats]: 'uSeats',
  [UsageMetric.Storage]: 'uStorage',
  [UsageMetric.Bandwidth]: 'uBandwidth',
  [UsageMetric.Requests]: 'uRequests',
  [UsageMetric.EssentialSmsMonthly]: 'uSms',
  [UsageMetric.EssentialSmsTotal]: 'uSms',
  [UsageMetric.OrdersMonthly]: 'uOrders',
  [UsageMetric.OrdersTotal]: 'uOrders',
  [UsageMetric.OrdersDaily]: 'uOrdersDay',
};

// Phase 4 Slice 4.3: the server counts orders handled; this page draws them with the order screens (Slice 4.8). Until
// then it shows the metrics its sketch draws.
const DRAWN_LATER: ReadonlySet<UsageMetric> = new Set([
  UsageMetric.OrdersMonthly,
  UsageMetric.OrdersTotal,
  UsageMetric.OrdersDaily,
]);

/** The usage as this page draws it today: without the figures still to be drawn. */
export function drawnUsage(usage: ShopUsage): ShopUsage {
  return { ...usage, metrics: usage.metrics.filter((figure) => !DRAWN_LATER.has(figure.metric)) };
}

// The add-on that raises each limit a seller can run out of, by the limit key the catalogue names (PLN-13).
const LIMIT_KEY: Partial<Record<UsageMetric, string>> = {
  [UsageMetric.Products]: 'products',
  [UsageMetric.Seats]: 'staff',
  [UsageMetric.Storage]: 'storage_mb',
};

/** A figure as its card writes it: "80", "48,210", "0.9 GB" -- bytes in the unit of the limit they are read against. */
export function amountOf(figure: UsageFigure, value: number): string {
  return figure.unit === 'bytes' ? usageSize(value, figure.limit) : value.toLocaleString('en-US');
}

/** The whole share of the limit used, as the bar and its colour read it; 0 when unlimited. */
export function percentOf(figure: UsageFigure): number {
  return figure.limit ? Math.round((figure.used / figure.limit) * 100) : 0;
}

/** The bar's colour: red from 95%, amber from 80% (the prototype's `.ubar`). */
export function barTone(figure: UsageFigure): 'bad' | 'warn' | null {
  const percent = percentOf(figure);
  return percent >= 95 ? 'bad' : percent >= 80 ? 'warn' : null;
}

/** The cycle's last day: it ends where the next begins. */
export function lastDayOf(usage: ShopUsage): string {
  return new Date(new Date(usage.cycleEnd).getTime() - 1).toISOString();
}

const SEVERITY: Readonly<Record<string, number>> = { stopped: 4, 100: 3, 95: 2, 80: 1 };

function severityOf(figure: UsageFigure | null): number {
  return figure?.level == null ? 0 : (SEVERITY[String(figure.level)] ?? 0);
}

/**
 * LIM-01 (agreed for Slice 11.5c): the banner's one metric, the nearest its stop -- past the grace, then 100%, 95% and
 * 80%; a tie goes to the card order. Null while every metric is under 80%.
 */
export function worstFigure(figures: readonly UsageFigure[]): UsageFigure | null {
  let worst: UsageFigure | null = null;
  for (const figure of figures) if (severityOf(figure) > severityOf(worst)) worst = figure;
  return worst;
}

/** The label of a catalogue item in the language shown. */
export function labelOf(addon: Addon, language: string): string {
  return language === 'bn' ? addon.labelBn : addon.labelEn;
}

/** A pack's size as its words say it: "10 GB" of bandwidth, "100,000" requests. */
export function packSize(addon: Addon): string {
  const size = addon.unitSize ?? 0;
  return addon.limitKey === 'bandwidth_gb' ? `${String(size)} GB` : size.toLocaleString('en-US');
}

/** The pack for sale for a metric, from the catalogue: what the links and the auto-buy switches name. */
export function packOffer(
  offers: readonly AddonOffer[],
  metric: PackMetric,
): AddonOffer | undefined {
  const limitKey = metric === UsageMetric.Bandwidth ? 'bandwidth_gb' : 'requests_monthly';
  return offers.find(
    (offer) => offer.addon.kind === AddonKind.Pack && offer.addon.limitKey === limitKey,
  );
}

/** Who was told, and how: an owner's email and phone; null for staff, whose notices go to the owner. */
export interface Channels {
  email: boolean;
  phone: boolean;
}

/** Where the banner leads: a pack, an add-on, the pack sheet with its auto-buy switches, or a top-up. */
export type BannerLink =
  | { kind: 'pack'; metric: PackMetric; label: string }
  | { kind: 'addon'; key: string; label: string }
  | { kind: 'topUp'; label: string };

export interface UsageBanner {
  tone: 'warn' | 'bad';
  text: string;
  link: BannerLink | null;
}

export interface BannerContext {
  t: T;
  language: string;
  offers: readonly AddonOffer[];
  /** Whether the viewer may buy and switch (`payments:manage`); read-only staff get the banner without its link. */
  canManage: boolean;
  /** The owner's channels; null for staff. */
  channels: Channels | null;
  /** The SMS rate, formatted, when the viewer may read the rates. */
  smsRate: string | null;
}

/**
 * LIM-01's channels (agreed for Slice 11.5c): an email to an owner with an email address; a free SMS too only for
 * bandwidth and requests at 100% and at the stop, to an owner with a phone. Staff are told nothing of the owner's.
 */
function toldLine(context: BannerContext, smsToo: boolean): string {
  const channels = context.channels;
  if (!channels) return '';
  const sms = smsToo && channels.phone;
  if (channels.email && sms) return context.t('uMailedSms');
  if (sms) return context.t('wSmsSent');
  return channels.email ? context.t('uMailed') : '';
}

/** What auto-buy did, where it is on: could not pay, or has bought its packs for the cycle. */
function autoBuyLine(pack: UsagePack | undefined, usage: ShopUsage, t: T): string {
  if (!pack?.autoBuy) return '';
  if (pack.autoBuyFailed) return t('uAbFailed');
  if (pack.autoPacks >= PACK_AUTO_BUY_CAP) {
    return t('uAbCapped', { cap: PACK_AUTO_BUY_CAP, date: formatDayMonth(usage.cycleEnd) });
  }
  return '';
}

const joined = (...parts: string[]): string => parts.filter(Boolean).join(' ');

/** The serving metrics' banner: the pace below the allowance, how far it serves past it, what stopped. */
function servingBanner(
  usage: ShopUsage,
  figure: UsageFigure & { metric: PackMetric },
  context: BannerContext,
): UsageBanner | null {
  const { t } = context;
  const limit = figure.limit ?? 0;
  const pack = usage.packs.find((each) => each.metric === figure.metric);
  const offer = packOffer(context.offers, figure.metric);
  const end = formatDayMonth(lastDayOf(usage));
  const used = amountOf(figure, figure.used);
  const of = amountOf(figure, limit);
  const did = autoBuyLine(pack, usage, t);
  const size = offer ? packSize(offer.addon) : '';
  const amount = offer?.price != null ? formatTaka(offer.price) : '';
  const buy: BannerLink | null =
    offer?.price != null
      ? { kind: 'pack', metric: figure.metric, label: t('pkBuyLink', { size, amount }) }
      : null;
  const packLink: BannerLink | null =
    offer?.price != null
      ? { kind: 'pack', metric: figure.metric, label: t('pkLink', { size, amount }) }
      : null;
  const topUp: BannerLink = { kind: 'topUp', label: t('topUp') };
  const failed = pack?.autoBuy === true && pack.autoBuyFailed;

  if (figure.level === 80 || figure.level === 95) {
    const pace = figure.runsOutAt
      ? t('uPaceOut', { date: formatDayMonth(figure.runsOutAt), end })
      : t('uPaceLasts', { end });
    const text = joined(
      t('uWarnAt', {
        metric: t(METRIC_KEY[figure.metric]),
        percent: figure.level,
        used,
        limit: of,
      }),
      pace,
      did,
      toldLine(context, false),
    );
    // At 80% the way out is auto-buy, in the pack sheet; at 95% the pack itself.
    const autoBuy: BannerLink | null =
      buy && !pack?.autoBuy ? { ...buy, label: t('w80Offer') } : null;
    return {
      tone: figure.level === 80 ? 'warn' : 'bad',
      text,
      link: figure.level === 80 ? autoBuy : buy,
    };
  }
  const told = toldLine(context, true);
  if (figure.level === 100) {
    const stop = amountOf(figure, figure.stopAt ?? limit);
    const key = figure.metric === UsageMetric.Bandwidth ? 'uUsedUpBw' : 'uUsedUpReq';
    const text = joined(t(key, { used, limit: of, stop, end }), did, told);
    return { tone: 'bad', text, link: failed ? topUp : packLink };
  }
  if (figure.level === 'stopped') {
    const percent = limit ? Math.round(((figure.stopAt ?? limit) / limit) * 100) : 100;
    const key = figure.metric === UsageMetric.Bandwidth ? 'wStopped' : 'uStoppedReq';
    const text = joined(t(key, { used, limit: of, percent }), did, told);
    return { tone: 'bad', text, link: failed ? topUp : packLink };
  }
  return null;
}

/**
 * LIM-01 (agreed for Slice 11.5c): the one banner, worded by the metric and its level, with its way out; null below
 * 80% everywhere. Its link is left out for read-only staff.
 */
export function bannerOf(usage: ShopUsage, context: BannerContext): UsageBanner | null {
  const figure = worstFigure(usage.metrics);
  if (!figure || figure.limit === null) return null;
  const banner = bannerFor(usage, figure, context);
  return banner && !context.canManage ? { ...banner, link: null } : banner;
}

function bannerFor(
  usage: ShopUsage,
  figure: UsageFigure,
  context: BannerContext,
): UsageBanner | null {
  const { t } = context;
  const metric = figure.metric;
  if (isServing(metric)) return servingBanner(usage, { ...figure, metric }, context);
  const limit = figure.limit ?? 0;
  const used = amountOf(figure, figure.used);
  const of = amountOf(figure, limit);
  const told = toldLine(context, false);
  if (figure.level === 80 || figure.level === 95) {
    const room = Math.max(limit - figure.used, 0);
    const words =
      figure.unit === 'bytes'
        ? t('uRoomSize', {
            metric: t(METRIC_KEY[metric]),
            percent: figure.level,
            size: amountOf(figure, room),
          })
        : t('uRoom', {
            metric: t(METRIC_KEY[metric]),
            percent: figure.level,
            count: room.toLocaleString('en-US'),
          });
    return { tone: figure.level === 80 ? 'warn' : 'bad', text: joined(words, told), link: null };
  }
  if (figure.level !== 100 && figure.level !== 'stopped') return null;
  if (metric === UsageMetric.EssentialSmsTotal) {
    return { tone: 'bad', text: joined(t('uFullSmsTrial', { used, limit: of }), told), link: null };
  }
  if (metric === UsageMetric.EssentialSmsMonthly) {
    const text = context.smsRate
      ? t('uFullSms', { used, limit: of, amount: context.smsRate })
      : t('uFullSmsNoRate', { used, limit: of });
    return { tone: 'warn', text: joined(text, told), link: null };
  }
  const key = { products: 'uFullProducts', seats: 'uFullSeats', storage: 'uFullStorage' }[
    metric as 'products' | 'seats' | 'storage'
  ];
  const offer = context.offers.find(
    (each) => each.addon.kind === AddonKind.Limit && each.addon.limitKey === LIMIT_KEY[metric],
  );
  const amount = offer?.amounts[0];
  const link: BannerLink | null =
    offer && offer.blockedBy === null && amount !== undefined
      ? {
          kind: 'addon',
          key: offer.addon.key,
          label: t('addonLink', {
            name: labelOf(offer.addon, context.language),
            amount: formatTaka(amount),
          }),
        }
      : null;
  return { tone: 'bad', text: joined(t(key, { used, limit: of }), told), link };
}

/** One way to room under a metric's card: its add-on or pack, a plan, or Lytro for a custom one. */
export type RaiseItem =
  | { kind: 'addon'; key: string; text: string }
  | { kind: 'pack'; metric: PackMetric; text: string }
  | { kind: 'plan'; planId: string; text: string }
  | { kind: 'contact'; text: string };

/**
 * LIM-01 (agreed for Slice 11.5c): "To raise it" under a metric at 80% or more -- the add-on or pack the server's
 * suggestion has for that metric, and the plan it suggests, in its order; a custom plan when nothing fits.
 */
export function raiseItems(
  usage: ShopUsage,
  figure: UsageFigure,
  offers: readonly AddonOffer[],
  t: T,
  language: string,
): RaiseItem[] {
  if (!usage.suggestions || severityOf(figure) === 0) return [];
  const items: RaiseItem[] = [];
  for (const suggestion of [usage.suggestions.first, usage.suggestions.alternative]) {
    if (!suggestion) continue;
    if (suggestion.kind === 'plan') {
      items.push({
        kind: 'plan',
        planId: suggestion.planId,
        text: t('uRaisePlan', { plan: suggestion.name }),
      });
      continue;
    }
    if (suggestion.kind === 'contact') {
      items.push({ kind: 'contact', text: t('uRaiseContact') });
      continue;
    }
    for (const item of suggestion.items) {
      if (item.metric !== figure.metric) continue;
      const offer = offers.find((each) => each.addon.id === item.addonId);
      if (offer?.addon.kind === AddonKind.Pack && isServing(figure.metric)) {
        const words = {
          count: item.quantity,
          size: packSize(offer.addon),
          amount: formatTaka(item.monthly),
        };
        items.push({
          kind: 'pack',
          metric: figure.metric,
          text: item.quantity === 1 ? t('uRaisePack', words) : t('uRaisePacks', words),
        });
        continue;
      }
      const name = offer ? labelOf(offer.addon, language) : item.name;
      items.push({
        kind: 'addon',
        key: item.key,
        text:
          item.quantity === 1
            ? t('uRaiseAddon', { name })
            : t('uRaiseAddons', { name, count: item.quantity }),
      });
    }
  }
  return items;
}

/** One bar of a day chart. */
export interface DayBar {
  day: string;
  value: number;
}

/** BND-08: each day of the cycle up to today, a day with nothing counted as nothing. */
export function cycleDays(
  usage: ShopUsage,
  counted: readonly { day: string; value: number }[],
  now = new Date().toISOString(),
): DayBar[] {
  const values = new Map(counted.map((each) => [each.day, each.value]));
  const last = dayKey(now);
  const bars: DayBar[] = [];
  for (let day = dayKey(usage.cycleStart); day <= last;) {
    bars.push({ day, value: values.get(day) ?? 0 });
    day = new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  }
  return bars;
}

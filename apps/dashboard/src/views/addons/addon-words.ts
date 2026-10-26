import { AddonKind, AddonRenewal, UsageMetric } from '@lytronix/validators';
import { daysUntil, formatTaka } from '@lytronix/ui';
import { formatDayMonth } from '@/lib/dates';
import { usageSize } from '@/lib/limits';
import type { Addon, AddonOffer, ShopAddon, ShopPack } from '@/types/addons';
import type { PricedAddon } from '@/types/billing';
import type { UsageFigure } from '@/types/usage';
import { invoiceNumber } from '@/views/billing/payment-words';

type T = (key: string, options?: Record<string, unknown>) => string;

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * BYTES_PER_MB;

/** One row of the add-ons list: the item, what it costs now (when for sale), and the purchase counting now. */
export interface AddonLine {
  addon: Addon;
  offer: AddonOffer | null;
  owned: ShopAddon | null;
}

export interface AddonGroup {
  kind: AddonKind;
  title: string;
  lines: AddonLine[];
}

const GROUP_TITLES: [AddonKind, string][] = [
  [AddonKind.Limit, 'aoLimitGrp'],
  [AddonKind.Pack, 'aoPackGrp'],
  [AddonKind.Feature, 'aoFeatGrp'],
];

/**
 * PLN-13 (TENANT-DASHBOARD-DESIGN §7.25): Raise a limit, Packs and Features, each item once in the catalogue's order
 * with the purchase that counts for it -- and an add-on whose item is no longer sold, which the catalogue leaves out.
 */
export function groupsOf(offers: readonly AddonOffer[], owned: readonly ShopAddon[]): AddonGroup[] {
  const lines: AddonLine[] = offers.map((offer) => ({
    addon: offer.addon,
    offer,
    owned: owned.find((each) => each.addonId === offer.addon.id) ?? null,
  }));
  for (const each of owned) {
    if (lines.some((line) => line.addon.id === each.addonId)) continue;
    const addon: Addon = {
      id: each.addonId,
      key: each.key,
      kind: each.kind,
      limitKey: each.limitKey,
      unitSize: each.unitSize,
      price: '',
      labelEn: each.labelEn,
      labelBn: each.labelBn,
      retiredAt: each.expiresAt,
    };
    lines.push({ addon, offer: null, owned: each });
  }
  return GROUP_TITLES.map(([kind, title]) => ({
    kind,
    title,
    lines: lines.filter((line) => line.addon.kind === kind),
  })).filter((group) => group.lines.length > 0);
}

/** An item's name in the language shown. */
export function nameOf(addon: Pick<Addon, 'labelEn' | 'labelBn'>, language: string): string {
  return language === 'bn' ? addon.labelBn : addon.labelEn;
}

/** How an add-on the shop has will renew, or why it will not; `warn` where it needs the seller. */
export function renewalLine(
  owned: ShopAddon,
  t: T,
  planName: string,
): { text: string; warn: boolean } {
  switch (owned.renewal) {
    case AddonRenewal.WithPlan:
      return { text: t('aoRenews'), warn: false };
    case AddonRenewal.FromBalance:
      return { text: t('aoRenewsBal'), warn: false };
    case AddonRenewal.BalanceShort:
      return { text: t('aoRenewShort'), warn: true };
    case AddonRenewal.Off:
      return { text: t('aoNoRenew', { date: formatDayMonth(owned.expiresAt) }), warn: true };
    case AddonRenewal.Retired:
      return { text: t('aoRetired'), warn: true };
    case AddonRenewal.Unlimited:
      return { text: t('aoNotNeeded', { plan: planName }), warn: false };
  }
}

/** Whether its renewal can be switched: not a pack, which is used up, and not one that will not renew anyway. */
export function switchable(owned: ShopAddon): boolean {
  return (
    owned.kind !== AddonKind.Pack &&
    owned.renewal !== AddonRenewal.Retired &&
    owned.renewal !== AddonRenewal.Unlimited
  );
}

/** What is left of a pack, as its row says it: "6.2 GB left", "61,400 left". */
export function packLeft(pack: ShopPack, t: T): string {
  return pack.metric === UsageMetric.Bandwidth
    ? t('aoPackLeft', { size: usageSize(pack.left, BYTES_PER_GB) })
    : t('aoPackLeftReq', { count: pack.left.toLocaleString('en-US') });
}

/** The metric a pack tops up. */
export function packMetric(addon: Addon): ShopPack['metric'] | null {
  if (addon.limitKey === 'bandwidth_gb') return UsageMetric.Bandwidth;
  if (addon.limitKey === 'requests_monthly') return UsageMetric.Requests;
  return null;
}

/**
 * The page's first line: the add-ons that renew with the plan and what their renewal adds -- the server's own list of
 * what the plan's renewal carries (`GET /billing/prices`) -- or, on pay-as-you-go, that each renews at its own end.
 */
export function headLine(
  context: {
    payg: boolean;
    owned: readonly ShopAddon[];
    renewing: readonly PricedAddon[];
    periodEnd: string | null;
  },
  t: T,
): string {
  if (context.payg) {
    const count = context.owned.filter((each) => each.kind !== AddonKind.Pack).length;
    return count > 0 ? t('aoHeadBal', { count }) : t('aoLead');
  }
  if (context.renewing.length === 0 || !context.periodEnd) return t('aoLead');
  const amount = context.renewing.reduce((sum, each) => sum + Number(each.amount), 0);
  return t('aoHead', {
    count: context.renewing.length,
    date: formatDayMonth(context.periodEnd),
    amount: formatTaka(amount),
  });
}

// What each kind's ending says will happen (LIM-03), by the limit it raised.
const ENDING: Record<string, string> = {
  products: 'alBannerProducts',
  staff: 'alBanner',
  storage_mb: 'alBannerStorage',
};

/**
 * PLN-14: the banner of an add-on ending within 7 days with its renewal off, by its kind, with the limit products and
 * storage return to from the shop's own figures -- none until those are read.
 */
export function endingBanner(
  owned: readonly ShopAddon[],
  figures: readonly UsageFigure[],
  t: T,
  language: string,
): { text: string; addon: ShopAddon } | null {
  const ending = owned.find((each) => each.endsSoon && each.renewal === AddonRenewal.Off);
  if (!ending) return null;
  const key =
    ending.kind === AddonKind.Feature
      ? 'alBannerBrand'
      : (ENDING[ending.limitKey ?? ''] ?? 'alBanner');
  const days = Math.max(daysUntil(ending.expiresAt) ?? 0, 1);
  const move = limitWithout(ending, figures);
  if (key !== 'alBanner' && key !== 'alBannerBrand' && !move) return null;
  const limit = move ? limitValue(move.limitKey, move.to) : undefined;
  return { text: t(key, { name: nameOf(ending, language), count: days, limit }), addon: ending };
}

/** A limit's figure: "600", or storage in its unit, "3 GB". */
export function limitValue(limitKey: string, value: number): string {
  return limitKey === 'storage_mb' ? usageSize(value, value) : value.toLocaleString('en-US');
}

/** The Buy sheet's "The limit becomes" line: "100 → 600 products", "2 GB → 3 GB". */
export function limitChange(move: { limitKey: string; from: number; to: number }, t: T): string {
  const change = `${limitValue(move.limitKey, move.from)} → ${limitValue(move.limitKey, move.to)}`;
  return move.limitKey === 'storage_mb' ? change : `${change} ${t(`lim.${move.limitKey}`)}`;
}

/** The figure a limit add-on raises, from the usage page's figures, and what one adds to it. */
const FIGURE_OF: Record<string, UsageMetric> = {
  products: UsageMetric.Products,
  staff: UsageMetric.Seats,
  storage_mb: UsageMetric.Storage,
};

/**
 * PLN-14: the limit before and after buying `quantity` of a limit add-on, in the limit's own unit (bytes for storage),
 * from the shop's own figure; null for a feature, or a limit the page does not know.
 */
export function limitMove(
  addon: Addon,
  quantity: number,
  figures: readonly UsageFigure[],
): { limitKey: string; from: number; to: number } | null {
  if (addon.kind !== AddonKind.Limit || !addon.limitKey || addon.unitSize === null) return null;
  const metric = FIGURE_OF[addon.limitKey];
  const limit = figures.find((figure) => figure.metric === metric)?.limit;
  if (limit === undefined || limit === null) return null;
  const unit = addon.limitKey === 'storage_mb' ? BYTES_PER_MB : 1;
  return { limitKey: addon.limitKey, from: limit, to: limit + addon.unitSize * quantity * unit };
}

/** LIM-03: the limit the shop returns to when an add-on it has ends -- its own figure less what the add-on adds. */
export function limitWithout(
  owned: Pick<ShopAddon, 'kind' | 'limitKey' | 'unitSize' | 'quantity'>,
  figures: readonly UsageFigure[],
): { limitKey: string; to: number } | null {
  if (owned.kind !== AddonKind.Limit || !owned.limitKey || owned.unitSize === null) return null;
  const limit = figures.find((figure) => figure.metric === FIGURE_OF[owned.limitKey ?? ''])?.limit;
  if (limit === undefined || limit === null) return null;
  const unit = owned.limitKey === 'storage_mb' ? BYTES_PER_MB : 1;
  return {
    limitKey: owned.limitKey,
    to: Math.max(limit - owned.unitSize * owned.quantity * unit, 0),
  };
}

/** The toast after a purchase: the add-on on and the limit it now gives, with its invoice when there is one. */
export function boughtToast(
  context: {
    addon: Addon;
    move: { limitKey: string; to: number } | null;
    invoice: { number: number; amount: string } | null;
  },
  t: T,
  language: string,
): string {
  const name = nameOf(context.addon, language);
  const on = context.move
    ? t('abBought', {
        name,
        limit: t(`lim.${context.move.limitKey}`),
        value: limitValue(context.move.limitKey, context.move.to),
      })
    : t('abBoughtFeature', { name });
  if (!context.invoice) return on;
  return `${on} · ${t('abInvoice', { number: invoiceNumber(context.invoice.number, t), amount: formatTaka(context.invoice.amount) })}`;
}

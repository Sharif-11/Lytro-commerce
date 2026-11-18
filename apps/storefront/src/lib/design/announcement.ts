import { AnnouncementItemKind, type AnnouncementItem } from '@lytronix/validators';
import type { PublicShop } from '../api/storefront-api';
import { deliveryRange } from '../catalogue/browse';
import { money, type Words } from '../i18n/words';

// STOREFRONT-BUILDER-PLAN BL-10, BL-17: the announcement bar's items as shoppers read them, two at a time.

/** One item: its words in parts that never break inside, and the offers' pill before them. */
export interface BarItem {
  parts: string[];
  pill: string | null;
}

/** BL-10: the items two at a time, the last alone when they are odd. */
export function barPairs<T>(items: readonly T[]): T[][] {
  const pairs: T[][] = [];
  for (let at = 0; at < items.length; at += 2) pairs.push(items.slice(at, at + 2));
  return pairs;
}

/**
 * BL-10: the delivery charges in the owner's words -- the home zone's, then the highest elsewhere ("ঢাকা সিটির ভেতরে
 * ডেলিভারি সর্বোচ্চ ৳70 · ঢাকা সিটির বাইরে সর্বোচ্চ ৳130"), each zone by the name the shop gives it. A shop that adds a
 * charge per kilo says where each starts instead (RAT-14). An older server, naming no zone's kind, gets the range.
 */
export function deliveryParts(
  info: Pick<PublicShop, 'deliveryZones' | 'extraDeliveryChargePerKg'>,
  words: Words,
): string[] | null {
  const zones = info.deliveryZones.filter((zone) => !zone.noDelivery);
  const home = zones.find((zone) => zone.kind === 'home');
  if (!home || zones.some((zone) => zone.kind === undefined)) {
    const range = deliveryRange(info.deliveryZones);
    if (range === null) return null;
    const r =
      range.from === range.to ? money(range.from) : `${money(range.from)}–${money(range.to)}`;
    return [words.t('sb_delivery', { r })];
  }
  const perKilo = Number(info.extraDeliveryChargePerKg ?? '0') > 0;
  const parts = [
    words.t(perKilo ? 'sb_bar_home_from' : 'sb_bar_home_max', {
      z: words.pick(home.name),
      c: money(home.charge),
    }),
  ];
  const away = zones.filter((zone) => zone.kind !== 'home');
  const named = away.find((zone) => zone.kind === 'fallback') ?? away[0];
  if (named) {
    const charges = away.map((zone) => Number(zone.charge));
    parts.push(
      words.t(perKilo ? 'sb_bar_away_from' : 'sb_bar_away_max', {
        z: words.pick(named.name),
        c: money(perKilo ? Math.min(...charges) : Math.max(...charges)),
      }),
    );
  }
  return parts;
}

/** BL-10: the bar's items in the seller's order: the automatic ones that are on and have something to say, and their own lines. */
export function barItems(
  items: readonly AnnouncementItem[],
  info: Pick<PublicShop, 'deliveryZones' | 'extraDeliveryChargePerKg' | 'sale'>,
  words: Words,
): BarItem[] {
  const sale = info.sale ?? { products: 0, bestDiscount: 0 };
  return items.flatMap((item): BarItem[] => {
    switch (item.kind) {
      case AnnouncementItemKind.CashOnDelivery:
        return item.visible ? [{ parts: [words.t('sb_cod')], pill: null }] : [];
      case AnnouncementItemKind.Delivery: {
        const parts = item.visible ? deliveryParts(info, words) : null;
        return parts ? [{ parts, pill: null }] : [];
      }
      case AnnouncementItemKind.Offers:
        return item.visible && sale.products > 0
          ? [
              {
                parts: [words.t('sb_offers_line', { n: sale.products, p: sale.bestDiscount })],
                pill: words.t('sb_offer'),
              },
            ]
          : [];
      case AnnouncementItemKind.Own:
        return [{ parts: [item.text], pill: null }];
    }
  });
}

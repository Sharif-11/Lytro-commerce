import type { AddonKind, AddonRenewal, UsageMetric } from '@lytronix/validators';
import type { Invoice, PlanPayment } from './billing';

/** Mirrors `AddonRecord` in apps/server/src/modules/billing/types/addon.ts: one item of the catalogue (PLN-13). */
export interface Addon {
  id: string;
  key: string;
  kind: AddonKind;
  limitKey: string | null;
  /** How much one adds, in its limit's own unit: GB of bandwidth, requests, products. */
  unitSize: number | null;
  /** Whole taka: a month of a limit or feature add-on, or one pack. */
  price: string;
  labelEn: string;
  labelBn: string;
  retiredAt: string | null;
}

/** GET /addons: an item for sale to this shop, with what it costs now (PLN-14, Slice 11.5c). */
export interface AddonOffer {
  addon: Addon;
  /** Whole taka for one to the period's end; null when the shop can't buy it now. */
  price: number | null;
  expiresAt: string | null;
  /** Why it can't be bought now, as the quote would refuse it (a message key); null when it can. */
  blockedBy: string | null;
  /** Whole taka for 1, 2, ... as each request works it out; empty with no price. */
  amounts: number[];
  daysLeft: number | null;
  /** Whole taka one costs for a whole next period. */
  renewalPrice: number | null;
}

/** GET /addons/mine: an add-on the shop has now, how it will renew, and whether its end is near without renewing. */
export interface ShopAddon {
  /** The purchase's id, which its renewal switch names. */
  id: string;
  addonId: string;
  key: string;
  kind: AddonKind;
  labelEn: string;
  labelBn: string;
  limitKey: string | null;
  unitSize: number | null;
  quantity: number;
  startsAt: string | null;
  expiresAt: string;
  renews: boolean;
  renewal: AddonRenewal;
  endsSoon: boolean;
}

/** What is left of the shop's packs for a metric (bytes of bandwidth, or requests), and its auto-buy switch. */
export interface ShopPack {
  metric: UsageMetric.Bandwidth | UsageMetric.Requests;
  left: number;
  autoBuy: boolean;
}

/** GET /addons/mine (PLN-14, BRN-05, PLN-15). */
export interface ShopAddons {
  addons: ShopAddon[];
  brandIdentity: boolean;
  packs: ShopPack[];
}

/** POST /addons/quote: the request, made when the seller commits (BIL-09). */
export interface AddonQuote {
  payment: PlanPayment;
  addon: Addon;
  quantity: number;
  expiresAt: string;
}

/** POST /addons/purchase and /addons/packs: the payment, and its invoice once paid (none while a wallet's is checked). */
export interface AddonPurchaseResult {
  payment: PlanPayment;
  invoice: Invoice | null;
}

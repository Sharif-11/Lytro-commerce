import type { AddonKind } from '@lytronix/validators';

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

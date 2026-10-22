import type {
  ActiveAddonRow,
  AddonActivation,
  AddonEdit,
  AddonPurchaseRow,
  AddonRow,
  AddonUnits,
  NewAddonPurchaseValues,
  NewAddonValues,
  PaymentAddonRow,
  RenewingAddonRow,
} from '@lytronix/db';
import type { AddonRenewal, UsageMetric } from '@lytronix/validators';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import type { InvoiceRecord } from '../../payments/types/invoice';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type AddonRecord = AddonRow;
export type AddonPurchaseRecord = AddonPurchaseRow;
export type ActiveAddon = ActiveAddonRow;
export type RenewingAddon = RenewingAddonRow;
export type PaymentAddon = PaymentAddonRow;
export type { AddonActivation, AddonEdit, AddonUnits, NewAddonPurchaseValues, NewAddonValues };

/** PLN-14, UPG-14: one add-on carried into a new period -- the purchase it continues, and what carrying it costs. */
export interface AddonCarry {
  from: RenewingAddon;
  /** Whole taka, as a money string. */
  price: string;
}

/** PLN-13, PLN-14: an add-on for sale, with what one costs for the rest of the shop's period. */
export interface AddonOffer {
  addon: AddonRecord;
  /** Whole taka for one, prorated to the period's end (PLN-14); null when the shop can't buy it now. */
  price: number | null;
  /** Until when it would run: the plan period's end; null with no price. */
  expiresAt: Date | null;
}

/** PLN-14: a quoted add-on, held like a plan quote (BIL-09), paid by confirming its payment. */
export interface AddonQuote {
  payment: PlanPaymentRecord;
  addon: AddonRecord;
  quantity: number;
  expiresAt: Date;
}

/**
 * PLN-14: an add-on paid for: its payment and its invoice (BIL-12) -- or, for a wallet payment waiting in the
 * operator's queue, no invoice yet.
 */
export interface AddonPurchaseResult {
  payment: PlanPaymentRecord;
  invoice: InvoiceRecord | null;
}

/**
 * PLN-14: an add-on the shop has, how it will renew, and whether it ends within the warning days without renewing --
 * what the dashboard's banner shows.
 */
export type ShopAddon = ActiveAddon & { renewal: AddonRenewal; endsSoon: boolean };

/** BND-04, RTE-11, PLN-15: what is left of the shop's packs for one metric, and whether auto-buy is on for it. */
export interface ShopPack {
  metric: UsageMetric.Bandwidth | UsageMetric.Requests;
  /** In the metric's own unit: bytes of bandwidth, or requests. */
  left: number;
  autoBuy: boolean;
}

/** PLN-14, BRN-05, PLN-15: what the shop has now, what that switches on, and its packs. */
export interface ShopAddons {
  addons: ShopAddon[];
  brandIdentity: boolean;
  packs: ShopPack[];
}

/** ADM-06: a payment waiting in the operator's queue, with the add-ons it pays for. */
export type QueuedPayment = PlanPaymentRecord & { addons: PaymentAddon[] };

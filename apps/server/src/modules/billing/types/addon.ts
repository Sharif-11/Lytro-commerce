import type {
  ActiveAddonRow,
  AddonEdit,
  AddonPurchaseRow,
  AddonRow,
  AddonUnits,
  NewAddonPurchaseValues,
  NewAddonValues,
} from '@lytronix/db';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import type { InvoiceRecord } from '../../payments/types/invoice';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type AddonRecord = AddonRow;
export type AddonPurchaseRecord = AddonPurchaseRow;
export type ActiveAddon = ActiveAddonRow;
export type { AddonEdit, AddonUnits, NewAddonPurchaseValues, NewAddonValues };

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

/** PLN-14: an add-on paid for: its payment and its invoice (BIL-12). */
export interface AddonPurchaseResult {
  payment: PlanPaymentRecord;
  invoice: InvoiceRecord;
}

/** PLN-14, BRN-05: what the shop has now, and what that switches on. */
export interface ShopAddons {
  addons: ActiveAddon[];
  brandIdentity: boolean;
}

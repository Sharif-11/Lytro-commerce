import type { LimitPart, OrderStatus, TenantState } from '@lytronix/validators';
import type { ShopAddons } from '../../billing/types/addon';
import type { SmsLogView } from '../../sms-events/services/sms-history';
import type { ShopUsage } from '../../usage/types/usage';

/** OPERATOR-CONSOLE-DESIGN §5: a shop as its page in the console reads it. */
export interface OperatorShop {
  id: string;
  slug: string;
  shopName: string;
  state: TenantState;
  createdAt: Date;
  planId: string | null;
  planName: string | null;
  planVersion: number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  overrideCount: number;
  /** LIF-24: null when the shop is not suspended. `by` is the operator's email. */
  suspension: { at: Date; reason: string | null; by: string | null } | null;
  /** TVR-03: null while the payment page takes payments. */
  paymentPageSuspension: { at: Date; reason: string | null } | null;
  /** TVR-04: what the operator set (null: as its kind says), and whether the cap holds for this shop now. */
  newShopCap: { set: boolean | null; holds: boolean };
}

/** PLN-13, PLN-11: the shop's add-ons and packs, and each limit as its plan, override and add-ons make it. */
export interface OperatorShopAddons {
  addons: ShopAddons['addons'];
  packs: ShopAddons['packs'];
  limits: LimitPart[];
}

/** ADM-03, D8-30: one of the shop's own SMS that didn't go, without the customer's phone or the words. */
export interface OperatorShopSms {
  id: number;
  kind: SmsLogView['kind'];
  status: SmsLogView['status'];
  blockedReason: SmsLogView['blockedReason'];
  orderNumber: string | null;
  units: number;
  createdAt: string;
}

/** ADM-03, D8-27: one member of the shop's team and when they last signed in to it (null: never). */
export interface OperatorShopSignIn {
  userId: string;
  name: string | null;
  phone: string | null;
  isOwner: boolean;
  lastAt: Date | null;
}

/**
 * ADM-03 (Phase 8 Slice 8.2): the figures the shop page opens with, each read through its own module inside the shop's
 * own context (D8-8). The lists behind them load when their card is opened.
 */
export interface OperatorShopFigures {
  balance: { amount: string; frozen: boolean; held: string };
  /** D8-31: each limit's use as the seller's usage page reads it, without its suggestions or pack offers. */
  usage: Pick<ShopUsage, 'cycleStart' | 'cycleEnd' | 'metrics' | 'payPerUse'>;
  /** The server faults of the last 24 hours. */
  errors: { since: Date; count: number };
  /**
   * D8-25, D8-30: the last 7 days' SMS that didn't go -- the shop's own, failed or blocked, and Lytro's own to the shop or
   * its team that failed for good.
   */
  failedSms: { since: Date; shop: { failed: number; blocked: number }; lytro: number };
  /** D8-26: the courier calls of the last 7 days that failed or the courier refused. */
  failedCourierCalls: { since: Date; count: number };
  signIns: OperatorShopSignIn[];
  /** D8-28: the seller's payments to Lytro waiting for the operator, and the shop's customers' waiting for the seller. */
  paymentsWaiting: { lytro: { count: number; amount: string }; customers: number };
  /** The shop's orders by the status the seller sees, every status named. */
  orders: Record<OrderStatus, number>;
}

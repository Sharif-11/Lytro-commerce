import type {
  OrderStatus,
  SalesBucket,
  SmsBlockedReason,
  SmsLogEntryKind,
  SmsLogStatus,
  TenantState,
  UsageMetric,
} from '@lytronix/validators';

// ADM-03, ADM-04, ADM-13 (Phase 8 Slices 8.2 and 8.3): the shop page's figures, the lists behind them and what the operator
// does to a shop, as apps/server/src/modules/team/dto/operator-shop-reads.dto.ts answers them.

/** LIM-02: one limit's use this cycle, as the seller's usage page reads it; a null limit is unlimited. */
export interface ShopUsageFigure {
  metric: UsageMetric;
  used: number;
  limit: number | null;
  unit: 'count' | 'bytes';
}

/** PLN-20: the address reads paid one by one this cycle. */
export interface ShopPayPerUse {
  key: 'address_reads';
  outsideAllowance: { count: number; cost: string };
}

/** D8-27: one member of the shop's team and when they last signed in to it (null: never). */
export interface ShopSignIn {
  userId: string;
  name: string | null;
  phone: string | null;
  isOwner: boolean;
  lastAt: string | null;
}

/** `operatorShopFiguresSchema`: what the shop page opens with. */
export interface ShopFigures {
  balance: { amount: string; frozen: boolean; held: string };
  usage: {
    cycleStart: string;
    cycleEnd: string;
    metrics: ShopUsageFigure[];
    payPerUse: ShopPayPerUse[];
  };
  errors: { since: string; count: number };
  failedSms: { since: string; shop: { failed: number; blocked: number }; lytro: number };
  failedCourierCalls: { since: string; count: number };
  signIns: ShopSignIn[];
  paymentsWaiting: { lytro: { count: number; amount: string }; customers: number };
  orders: Record<OrderStatus, number>;
}

/** D8-23: a kept server fault: its kind, where and its ID, never a message. */
export interface ShopError {
  id: number;
  requestId: string;
  method: string;
  route: string | null;
  status: number;
  kind: string;
  createdAt: string;
}

export interface ShopErrorPage {
  errors: ShopError[];
  nextBefore: number | null;
}

/** D8-30: the shop's own SMS that didn't go, without the customer's phone or the words. */
export interface ShopFailedSms {
  id: number;
  kind: SmsLogEntryKind;
  status: SmsLogStatus;
  blockedReason: SmsBlockedReason | null;
  orderNumber: string | null;
  units: number;
  createdAt: string;
}

/** D8-30: one of Lytro's own SMS to the shop or its team that failed for good. */
export interface LytroFailedSms {
  id: number;
  kind: string;
  toPhone: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export interface ShopFailedSmsLists {
  shop: ShopFailedSms[];
  lytro: LytroFailedSms[];
}

/** STA-01: the sales in a stretch of days, as the seller's Sales page reads them. */
export interface ShopSalesFigure {
  orders: number;
  revenue: string;
  deliveryCharges: string | null;
  courierCharges: string | null;
}

export interface ShopSales {
  dateFrom: string;
  dateTo: string;
  bucket: SalesBucket;
  buckets: (ShopSalesFigure & { from: string; to: string })[];
  totals: ShopSalesFigure;
}

/** ADM-04, D8-12: where the extended period now ends, and whether a lapsed shop came back. */
export interface PlanExtension {
  periodEnd: string;
  state: TenantState;
  restored: boolean;
}

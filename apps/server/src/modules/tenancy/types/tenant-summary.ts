import type { PlanLimits, TenantState } from '@lytronix/validators';

/** A shop as the dashboard and the lifecycle gate see it (AUTH-22, AUTH-23). */
export interface TenantSummary {
  id: string;
  slug: string;
  shopName: string;
  state: TenantState;
  suspendedAt: Date | null;
  planId: string | null;
  planName: string | null;
  /** PLN-05, PLN-06, PLN-11: the shop's own limits: its plan snapshot with its overrides laid over it. */
  planLimits: PlanLimits | null;
  /** UPG-10, PYG-19: with the state and creation date, what the shop's usage cycles are counted from. */
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
  /** TEN-31: the account that owns the shop, for the dashboard's membership check. */
  ownerSubscriberId: string;
  /** PST-01: the shop's main business type (a preset key), which sets new products' defaults; null until chosen. */
  businessType: string | null;
}

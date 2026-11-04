import type { LimitPart, TenantState } from '@lytronix/validators';
import type { ShopAddons } from '../../billing/types/addon';

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

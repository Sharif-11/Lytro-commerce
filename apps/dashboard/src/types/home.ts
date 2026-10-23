/**
 * Mirrors `homeViewSchema` in apps/server/src/modules/team/dto/home-response.dto.ts (GET /home,
 * TENANT-DASHBOARD-DESIGN §7.1). Each part is null when the person may not see it (STF-11).
 */
export interface BeingChecked {
  count: number;
  amount: string;
}

export interface HomeView {
  products: { total: number; active: number } | null;
  stock: { low: number; out: number; expiringBatches: number } | null;
  balance: { amount: string; low: boolean; freeSms: { used: number; limit: number | null } } | null;
  topUpsBeingChecked: BeingChecked | null;
  paymentsBeingChecked: BeingChecked | null;
  staffWithoutPassword: number | null;
  fastSpendAlertedAt: string | null;
  checklist: {
    /** The two zones' charges, and the home area they are named after ("Inside Dhaka city"). */
    deliveryCharges: { area: { en: string; bn: string }; inside: string; outside: string };
    firstProduct: boolean;
    logo: boolean;
    linkShared: boolean;
    apiKey: boolean;
  } | null;
}

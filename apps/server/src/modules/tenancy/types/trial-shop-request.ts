export interface TrialShopRequest {
  identityId: string;
  subscriberId: string;
  shopName: string;
  slug: string;
  ownerPhone: string;
  ownerEmail: string | null;
  ownerName: string;
  // SMS-18 (amended 2026-11-12): where the owner runs the shop, which the shop-ready SMS sends.
  dashboardUrl: string;
}

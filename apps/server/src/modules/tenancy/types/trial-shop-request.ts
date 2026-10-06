export interface TrialShopRequest {
  identityId: string;
  subscriberId: string;
  shopName: string;
  slug: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerName: string;
  liveUrl: string;
}

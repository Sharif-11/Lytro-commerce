export interface TrialShopRequest {
  identityId: string;
  subscriberId: string;
  shopName: string;
  slug: string;
  ownerPhone: string;
  ownerEmail: string | null;
  ownerName: string;
  liveUrl: string;
}

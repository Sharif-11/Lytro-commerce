/** Mirrors `AdTrackingView` in apps/server/src/modules/public-api/types/public-api.ts (LND-15 to LND-17). */
export interface AdTracking {
  metaPixelId: string | null;
  /** Whether a Conversions API token is set; the token itself never comes back. */
  conversionsApiConnected: boolean;
  updatedAt: string | null;
}

/** Mirrors `CatalogFeedView` (FED-01, FED-05): the shop's Meta catalog feed link, and when it was last made. */
export interface CatalogFeed {
  url: string;
  regeneratedAt: string;
}

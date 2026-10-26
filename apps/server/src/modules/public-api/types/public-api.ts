import type {
  ApiShopRow,
  ApiUsageCounts,
  ApiUsageDayRow,
  ApiUsageRow,
  NewApiKey,
  SelectApiKey,
} from '@lytronix/db';
import type { ApiKeyType, PlanLimits } from '@lytronix/validators';
import type { LiveBrand } from '../../brand/types/brand';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type ApiKeyRecord = SelectApiKey;
export type { ApiShopRow, ApiUsageCounts, ApiUsageRow, NewApiKey };
/** A shop's requests on one Asia/Dhaka day of a cycle (YYYY-MM-DD). */
export type ApiUsageDay = ApiUsageDayRow;

/** API-01: a key as the shop sees it: never its value, which was shown once. */
export interface ApiKeyView {
  id: string;
  name: string;
  type: ApiKeyType;
  /** The key's first characters, to recognise it by. */
  prefix: string;
  websites: string[];
  expiresAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/** API-01: a key just made, with its value -- the one time it is shown. */
export interface CreatedApiKeyView extends ApiKeyView {
  key: string;
}

/** A key the public API accepted, with the shop it acts for. */
export interface AuthenticatedKey {
  id: string;
  tenantId: string;
  websites: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/** The shop a key acts for, as the public API needs it: whether it is open, its limits and its billing cycle. */
export interface ApiShop {
  row: ApiShopRow;
  /** PLN-11, PLN-13: the snapshot with the shop's overrides over it and its limit add-ons on top. */
  limits: PlanLimits | null;
}

/** GET /v1/shop: the shop a key belongs to, as anyone holding the key may see it. */
export interface PublicShopView {
  name: string;
  slug: string;
  /** LND-15: the Meta Pixel its pages load; null when none is connected. */
  metaPixelId: string | null;
  /** BRN-07: the shop's own identity as tokens; null for Lytro's default. */
  brand: LiveBrand | null;
}

/** LND-15 to LND-17: the shop's ad tracking as the dashboard sees it: never the Conversions API token. */
export interface AdTrackingView {
  metaPixelId: string | null;
  conversionsApiConnected: boolean;
  updatedAt: Date | null;
}

/** FED-01, FED-06: the shop's Meta catalog feed link, and when it was last replaced. */
export interface CatalogFeedView {
  url: string;
  regeneratedAt: Date;
}

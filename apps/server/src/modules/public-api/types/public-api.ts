import type { ApiShopRow, ApiUsageRow, NewApiKey, SelectApiKey } from '@lytronix/db';
import type { ApiKeyType, PlanLimits } from '@lytronix/validators';
import type { UsageWarning } from '../../../common/usage-warnings';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type ApiKeyRecord = SelectApiKey;
export type { ApiShopRow, ApiUsageRow, NewApiKey };

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
  /** PLN-11: the snapshot with the shop's overrides over it. */
  limits: PlanLimits | null;
}

/** RTE-03: a shop's keys have made this share of the requests its billing cycle allows. */
export interface RequestQuotaNotice {
  tenantId: string;
  cycleStart: Date;
  percent: UsageWarning;
  requests: number;
  limit: number;
}

/** GET /v1/shop: the shop a key belongs to, as anyone holding the key may see it. */
export interface PublicShopView {
  name: string;
  slug: string;
  /** LND-15: the Meta Pixel its pages load; null when none is connected. */
  metaPixelId: string | null;
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

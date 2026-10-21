import { text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bytea, tenant } from '../shared';

// LND-15 to LND-17: a shop's ad tracking, one row per shop. The Meta Pixel ID is public: the landing pages carry it.
// The Conversions API token is sealed by the server's secret box (SEC-10), bound to this shop, and never returned.
export const adTrackingSettings = tenant.table('ad_tracking_settings', {
  tenantId: uuid('tenant_id').primaryKey(),
  metaPixelId: text('meta_pixel_id'),
  metaCapiTokenEnc: bytea('meta_capi_token_enc'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectAdTrackingSettings = typeof adTrackingSettings.$inferSelect;

import { boolean, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bytea, tenant } from '../shared';

// LND-15 to LND-17: a shop's ad tracking, one row per shop. The Meta Pixel ID is public: the landing pages carry it.
// The Conversions API token is sealed by the server's secret box (SEC-10), bound to this shop, and never returned.
export const adTrackingSettings = tenant.table('ad_tracking_settings', {
  tenantId: uuid('tenant_id').primaryKey(),
  metaPixelId: text('meta_pixel_id'),
  metaCapiTokenEnc: bytea('meta_capi_token_enc'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// SEC-11 (Phase 9 Slice 9.7): every purchase sent to Meta with the shop's stored Conversions API token -- when, for which
// order, and whether Meta took it -- never the token, as the courier and gateway credentials' uses are kept. Each shop's
// own, for the operator to read and export in a dispute; it goes with the shop at day 60. RLS like every tenant table.
export const adTrackingCredentialUses = tenant.table(
  'ad_tracking_credential_uses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    // What the token was used for: today only a purchase sent ('purchase_sent').
    action: text('action').notNull(),
    orderId: uuid('order_id'),
    succeeded: boolean('succeeded').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ad_tracking_credential_uses_tenant_idx').on(t.tenantId, t.at)],
);

export type SelectAdTrackingSettings = typeof adTrackingSettings.$inferSelect;
export type SelectAdTrackingCredentialUse = typeof adTrackingCredentialUses.$inferSelect;

-- STOREFRONT-BUILDER-PLAN (the owner, 2026-11-18): each shop's storefront design (SB-12, SB-14), every plan's own
-- icon (SB-5) and a product's regular price (SB-21). Kind: add -- a new table and nullable or defaulted columns, no
-- data moved. The previous release neither reads nor writes any of them.
CREATE TABLE "tenant"."storefront_designs" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"draft" jsonb,
	"published" jsonb,
	"previous" jsonb,
	"media_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"draft_saved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant"."shop_settings" ADD COLUMN "icon_media_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."product_variants" ADD COLUMN "regular_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "regular_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "min_regular_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "best_discount" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: row-level security, the icon's key and check, the prices' checks and grants (not expressible in
-- Drizzle).
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.storefront_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.storefront_designs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.storefront_designs
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- SB-5, MED-09: the icon is an image of the shop's own (DAT-02); deleting it clears only the icon. NOT VALID: every
-- existing row's icon is null, and new rows are checked.
ALTER TABLE tenant.shop_settings ADD CONSTRAINT shop_settings_icon_fk
  FOREIGN KEY (tenant_id, icon_media_id) REFERENCES tenant.media (tenant_id, id) ON DELETE SET NULL (icon_media_id) NOT VALID;
--> statement-breakpoint
-- MED-03: as the logo is, a ready image, never one still uploading, refused, or a video (0065's check).
CREATE TRIGGER shop_settings_icon_ready BEFORE INSERT OR UPDATE OF icon_media_id ON tenant.shop_settings
  FOR EACH ROW WHEN (NEW.icon_media_id IS NOT NULL) EXECUTE FUNCTION tenant.check_attached_image('icon_media_id');
--> statement-breakpoint
-- SB-21: a regular price is never negative, as no price is. NOT VALID: every existing row's is null.
ALTER TABLE tenant.products ADD CONSTRAINT products_regular_price_check
  CHECK (regular_price IS NULL OR regular_price >= 0) NOT VALID;
--> statement-breakpoint
ALTER TABLE tenant.product_variants ADD CONSTRAINT product_variants_regular_price_check
  CHECK (regular_price IS NULL OR regular_price >= 0) NOT VALID;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.storefront_designs TO lytronix_app;
  END IF;
END $$;

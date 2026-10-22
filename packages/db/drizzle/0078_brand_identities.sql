CREATE TYPE "tenant"."brand_corners" AS ENUM('square', 'soft', 'round');--> statement-breakpoint
CREATE TYPE "tenant"."brand_font" AS ENUM('noto_sans_bengali_inter', 'hind_siliguri_plus_jakarta_sans', 'anek_bangla_dm_sans', 'baloo_da_2_poppins', 'tiro_bangla_lora', 'noto_serif_bengali_fraunces', 'galada_playfair_display');--> statement-breakpoint
CREATE TYPE "tenant"."brand_spacing" AS ENUM('compact', 'comfortable', 'airy');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."brand_identities" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"use_brand" boolean DEFAULT false NOT NULL,
	"main_color" varchar(7) NOT NULL,
	"accent_color" varchar(7) NOT NULL,
	"background_color" varchar(7) NOT NULL,
	"heading_font" "tenant"."brand_font" NOT NULL,
	"body_font" "tenant"."brand_font" NOT NULL,
	"corners" "tenant"."brand_corners" NOT NULL,
	"spacing" "tenant"."brand_spacing" NOT NULL,
	"dark_logo_media_id" uuid,
	"icon_media_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_identities_colors_check" CHECK ("tenant"."brand_identities"."main_color" ~ '^#[0-9a-f]{6}$' AND "tenant"."brand_identities"."accent_color" ~ '^#[0-9a-f]{6}$' AND "tenant"."brand_identities"."background_color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "brand_identities_body_font_check" CHECK ("tenant"."brand_identities"."body_font" <> 'galada_playfair_display')
);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: row-level security, the images' keys and checks, and grants (not expressible in Drizzle).
-- DATABASE-SCHEMA §3.2 and §3.5, Phase 3 Slice 11.2 (BRN-02, BRN-07).
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.brand_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.brand_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.brand_identities
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- MED-09: the logo on dark and the square icon are images of the shop's own (DAT-02), and deleting one clears only it;
-- the identity stays.
ALTER TABLE tenant.brand_identities ADD CONSTRAINT brand_identities_dark_logo_fk
  FOREIGN KEY (tenant_id, dark_logo_media_id) REFERENCES tenant.media (tenant_id, id) ON DELETE SET NULL (dark_logo_media_id);
--> statement-breakpoint
ALTER TABLE tenant.brand_identities ADD CONSTRAINT brand_identities_icon_fk
  FOREIGN KEY (tenant_id, icon_media_id) REFERENCES tenant.media (tenant_id, id) ON DELETE SET NULL (icon_media_id);
--> statement-breakpoint
-- MED-03, TEN-16: as the logo is, each is a ready image, never one still uploading, refused, or a video (0065's check).
CREATE TRIGGER brand_identities_dark_logo_ready BEFORE INSERT OR UPDATE OF dark_logo_media_id ON tenant.brand_identities
  FOR EACH ROW WHEN (NEW.dark_logo_media_id IS NOT NULL) EXECUTE FUNCTION tenant.check_attached_image('dark_logo_media_id');
--> statement-breakpoint
CREATE TRIGGER brand_identities_icon_ready BEFORE INSERT OR UPDATE OF icon_media_id ON tenant.brand_identities
  FOR EACH ROW WHEN (NEW.icon_media_id IS NOT NULL) EXECUTE FUNCTION tenant.check_attached_image('icon_media_id');
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.brand_identities TO lytronix_app;
  END IF;
END $$;

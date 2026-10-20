CREATE TYPE "tenant"."media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "tenant"."media_object_role" AS ENUM('main', 'thumbnail', 'poster');--> statement-breakpoint
CREATE TYPE "tenant"."media_purpose" AS ENUM('product_image', 'product_video', 'category_image', 'swatch_image', 'size_chart_image', 'shop_logo');--> statement-breakpoint
CREATE TYPE "tenant"."media_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "tenant"."media_kind" NOT NULL,
	"status" "tenant"."media_status" DEFAULT 'uploading' NOT NULL,
	"purpose" "tenant"."media_purpose" NOT NULL,
	"target_id" uuid,
	"upload_key" text,
	"content_type" varchar(100) NOT NULL,
	"declared_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"hash" varchar(64),
	"failure" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "media_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "media_declared_bytes_check" CHECK ("tenant"."media"."declared_bytes" > 0),
	CONSTRAINT "media_ready_check" CHECK (("tenant"."media"."status" = 'ready') = ("tenant"."media"."ready_at" IS NOT NULL AND "tenant"."media"."hash" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."media_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" "tenant"."media_object_role" NOT NULL,
	"key" text NOT NULL,
	"bytes" bigint NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_objects_key_key" UNIQUE("key"),
	CONSTRAINT "media_objects_bytes_check" CHECK ("tenant"."media_objects"."bytes" >= 0),
	CONSTRAINT "media_objects_prefix_check" CHECK ("tenant"."media_objects"."key" LIKE 'tenants/' || "tenant"."media_objects"."tenant_id"::text || '/%')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."product_images" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "product_images_pkey" PRIMARY KEY("tenant_id","product_id","media_id"),
	CONSTRAINT "product_images_order_check" CHECK ("tenant"."product_images"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tenant"."size_charts" ALTER COLUMN "table_rows" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."shop_settings" ADD COLUMN "logo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."categories" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."size_charts" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."attribute_options" ADD COLUMN "swatch_image_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."media_objects" ADD CONSTRAINT "media_objects_media_fk" FOREIGN KEY ("tenant_id","media_id") REFERENCES "tenant"."media"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_images" ADD CONSTRAINT "product_images_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "tenant"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_images" ADD CONSTRAINT "product_images_media_fk" FOREIGN KEY ("tenant_id","media_id") REFERENCES "tenant"."media"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_tenant_created_idx" ON "tenant"."media" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_tenant_status_idx" ON "tenant"."media" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_objects_media_role_idx" ON "tenant"."media_objects" USING btree ("tenant_id","media_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_images_order_idx" ON "tenant"."product_images" USING btree ("tenant_id","product_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_images_media_idx" ON "tenant"."product_images" USING btree ("tenant_id","media_id");--> statement-breakpoint
ALTER TABLE "tenant"."size_charts" ADD CONSTRAINT "size_charts_content_check" CHECK (("tenant"."size_charts"."image_id" IS NULL) <> ("tenant"."size_charts"."table_rows" IS NULL));--> statement-breakpoint
ALTER TABLE "tenant"."attribute_options" ADD CONSTRAINT "attribute_options_swatch_one_check" CHECK ("tenant"."attribute_options"."swatch_color" IS NULL OR "tenant"."attribute_options"."swatch_image_id" IS NULL);--> statement-breakpoint
ALTER TABLE "tenant"."attribute_options" ADD CONSTRAINT "attribute_options_swatch_image_check" CHECK ("tenant"."attribute_options"."swatch_image_id" IS NULL OR "tenant"."attribute_options"."tenant_id" IS NOT NULL);--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, keys, triggers, grants and seed data (not expressible in Drizzle). Reviewed with the schema
-- above. DATABASE-SCHEMA §3.2 (catalogue) and §3.5 (media), Phase 3 Slice 6a (MED-01, MED-03, MED-04, PRD-11).
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['media', 'media_objects', 'product_images'] LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
        'WITH CHECK (tenant_id = tenant.current_tenant_id())',
      name
    );
  END LOOP;
END $$;
--> statement-breakpoint
-- MED-09: an image attached elsewhere is the shop's own (DAT-02), and deleting it clears only the image -- the
-- category, the swatch and the logo stay -- while an image size chart, which is nothing without its image, goes too.
ALTER TABLE tenant.categories ADD CONSTRAINT categories_image_fk
  FOREIGN KEY (tenant_id, image_id) REFERENCES tenant.media (tenant_id, id) ON DELETE SET NULL (image_id);
--> statement-breakpoint
ALTER TABLE tenant.attribute_options ADD CONSTRAINT attribute_options_swatch_image_fk
  FOREIGN KEY (tenant_id, swatch_image_id) REFERENCES tenant.media (tenant_id, id) ON DELETE SET NULL (swatch_image_id);
--> statement-breakpoint
ALTER TABLE tenant.shop_settings ADD CONSTRAINT shop_settings_logo_fk
  FOREIGN KEY (tenant_id, logo_media_id) REFERENCES tenant.media (tenant_id, id) ON DELETE SET NULL (logo_media_id);
--> statement-breakpoint
ALTER TABLE tenant.size_charts ADD CONSTRAINT size_charts_image_fk
  FOREIGN KEY (tenant_id, image_id) REFERENCES tenant.media (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
-- MED-03, PRD-11, ATR-18, PRD-17, TEN-16: what is attached anywhere -- a product's photo, a category's banner, a swatch,
-- a size chart, the logo -- is a ready image of the shop's, never one still uploading, refused, or a video. The column
-- the trigger reads is its argument.
CREATE FUNCTION tenant.check_attached_image() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  attached uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
BEGIN
  IF attached IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenant.media m
    WHERE m.tenant_id = NEW.tenant_id AND m.id = attached AND m.status = 'ready' AND m.kind = 'image'
  ) THEN
    RAISE EXCEPTION 'media % is not a ready image of this shop', attached
      USING ERRCODE = 'check_violation', CONSTRAINT = 'media_ready_image';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_images_ready BEFORE INSERT OR UPDATE OF media_id ON tenant.product_images
  FOR EACH ROW EXECUTE FUNCTION tenant.check_attached_image('media_id');
--> statement-breakpoint
CREATE TRIGGER categories_image_ready BEFORE INSERT OR UPDATE OF image_id ON tenant.categories
  FOR EACH ROW WHEN (NEW.image_id IS NOT NULL) EXECUTE FUNCTION tenant.check_attached_image('image_id');
--> statement-breakpoint
CREATE TRIGGER attribute_options_swatch_ready BEFORE INSERT OR UPDATE OF swatch_image_id ON tenant.attribute_options
  FOR EACH ROW WHEN (NEW.swatch_image_id IS NOT NULL)
  EXECUTE FUNCTION tenant.check_attached_image('swatch_image_id');
--> statement-breakpoint
CREATE TRIGGER size_charts_image_ready BEFORE INSERT OR UPDATE OF image_id ON tenant.size_charts
  FOR EACH ROW WHEN (NEW.image_id IS NOT NULL) EXECUTE FUNCTION tenant.check_attached_image('image_id');
--> statement-breakpoint
CREATE TRIGGER shop_settings_logo_ready BEFORE INSERT OR UPDATE OF logo_media_id ON tenant.shop_settings
  FOR EACH ROW WHEN (NEW.logo_media_id IS NOT NULL) EXECUTE FUNCTION tenant.check_attached_image('logo_media_id');
--> statement-breakpoint
-- MED-03: an item only moves forward -- its upload link given out, its file processing, then ready or refused -- and
-- what it is never changes once it is ready or refused. Its stored files are written only while it is processing.
CREATE FUNCTION tenant.guard_media() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'media_objects' THEN
    IF NOT EXISTS (
      SELECT 1 FROM tenant.media m
      WHERE m.tenant_id = NEW.tenant_id AND m.id = NEW.media_id AND m.status = 'processing'
    ) THEN
      RAISE EXCEPTION 'media % is not being processed', NEW.media_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'media_objects_while_processing';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'uploading' THEN
      RAISE EXCEPTION 'a media item starts out uploading'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'media_moves_forward';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.status IN ('ready', 'failed')
     OR NOT (
       NEW.status = OLD.status
       OR (OLD.status = 'uploading' AND NEW.status IN ('processing', 'failed'))
       OR (OLD.status = 'processing' AND NEW.status IN ('ready', 'failed'))
     ) THEN
    RAISE EXCEPTION 'media % moves only forward, and is kept as it ended', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'media_moves_forward';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER media_guard BEFORE INSERT OR UPDATE ON tenant.media
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_media();
--> statement-breakpoint
CREATE TRIGGER media_objects_guard BEFORE INSERT ON tenant.media_objects
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_media();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.media TO lytronix_app;
    GRANT SELECT, INSERT, DELETE ON tenant.media_objects TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.product_images TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- STO-04, STO-05 (2.1, "editable"): the largest image and video one upload may be, in MB.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('media_image_max_mb', '5', 'The largest image one upload may be, in MB (STO-04).'),
  ('media_video_max_mb', '100', 'The largest video one upload may be, in MB (STO-05).')
ON CONFLICT (key) DO NOTHING;

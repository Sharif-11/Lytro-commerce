CREATE TABLE IF NOT EXISTS "control"."media_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recorded_bytes" bigint NOT NULL,
	"stored_bytes" bigint NOT NULL,
	"missing_files" integer NOT NULL,
	"stray_files" integer NOT NULL,
	"strays_deleted" integer NOT NULL,
	"mismatch_percent" numeric(9, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_reconciliations_counts_check" CHECK ("control"."media_reconciliations"."recorded_bytes" >= 0 AND "control"."media_reconciliations"."stored_bytes" >= 0 AND "control"."media_reconciliations"."missing_files" >= 0 AND "control"."media_reconciliations"."stray_files" >= 0 AND "control"."media_reconciliations"."strays_deleted" BETWEEN 0 AND "control"."media_reconciliations"."stray_files")
);
--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "video_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."media_reconciliations" ADD CONSTRAINT "media_reconciliations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_reconciliations_tenant_idx" ON "control"."media_reconciliations" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written keys, triggers, grants and settings (not expressible in Drizzle). DATABASE-SCHEMA §3.2 (catalogue) and
-- §3.5 (media), Phase 3 Slice 6b (PRD-11, MED-04, STO-05).
-- ---------------------------------------------------------------------------------------------

-- PRD-11: a product's one video is the shop's own (DAT-02); deleting the video clears it, and the product stays.
ALTER TABLE tenant.products ADD CONSTRAINT products_video_fk
  FOREIGN KEY (tenant_id, video_id) REFERENCES tenant.media (tenant_id, id) ON DELETE SET NULL (video_id);
-- PRD-11: what a product shows as its video is a ready video of the shop's, never one still uploading, refused, or an
-- image. The column the trigger reads is its argument, as tenant.check_attached_image's is.
CREATE FUNCTION tenant.check_attached_video() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  attached uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
BEGIN
  IF attached IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenant.media m
    WHERE m.tenant_id = NEW.tenant_id AND m.id = attached AND m.status = 'ready' AND m.kind = 'video'
  ) THEN
    RAISE EXCEPTION 'media % is not a ready video of this shop', attached
      USING ERRCODE = 'check_violation', CONSTRAINT = 'media_ready_video';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_video_ready BEFORE INSERT OR UPDATE OF video_id ON tenant.products
  FOR EACH ROW WHEN (NEW.video_id IS NOT NULL) EXECUTE FUNCTION tenant.check_attached_video('video_id');
-- MED-04: the nightly run adds its findings; the day-60 deletion removes a lapsed shop's.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, DELETE ON control.media_reconciliations TO lytronix_app;
  END IF;
END $$;
-- STO-05 (amended 2026-10-21): a video may be up to 150 MB, so a 1-minute 1080p phone clip fits. An operator's own
-- value is kept.
UPDATE control.platform_settings
SET value = '150', description = 'The largest video one upload may be, in MB (STO-05).', updated_at = now()
WHERE key = 'media_video_max_mb' AND value = '100'::jsonb AND updated_by IS NULL;

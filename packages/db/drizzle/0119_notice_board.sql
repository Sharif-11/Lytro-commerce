-- Phase 7 Slice 7.4 (read agreed 2026-11-07): the notice board. Lytro's notices to shops in both languages, with their
-- audience, times, maintenance window and the rate change they tell of (NTC-01, NTC-02, NTC-13, NTC-14); each earlier
-- version of a live one (NTC-08); what each person in a shop did with one, and each shop's "I understand" (NTC-03 to
-- NTC-05, NTC-09); and each shop a notice was sent to (NTC-06). Platform-wide, in `control` with no row-level security:
-- the operator counts the reads, acknowledgments and deliveries across every shop, and a shop's routes read only its own.
CREATE TABLE IF NOT EXISTS "control"."notice_acknowledgments" (
	"notice_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_acknowledgments_notice_id_tenant_id_pk" PRIMARY KEY("notice_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."notice_deliveries" (
	"notice_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"people" integer NOT NULL,
	"emailed" boolean NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_deliveries_notice_id_tenant_id_pk" PRIMARY KEY("notice_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."notice_reads" (
	"notice_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "notice_reads_notice_id_tenant_id_user_id_pk" PRIMARY KEY("notice_id","tenant_id","user_id"),
	CONSTRAINT "notice_reads_seen_check" CHECK ("control"."notice_reads"."read_at" IS NOT NULL OR "control"."notice_reads"."dismissed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."notice_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"notice_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"edited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_bn" varchar(120),
	"title_en" varchar(120),
	"body_bn" varchar(5000),
	"body_en" varchar(5000),
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"audience" jsonb NOT NULL,
	"publish_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"pinned" boolean DEFAULT false NOT NULL,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"window_starts_at" timestamp with time zone,
	"window_ends_at" timestamp with time zone,
	"rate_change_id" bigint,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" uuid,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notices_category_check" CHECK ("control"."notices"."category" in ('rate_change','maintenance','new_feature','policy','security','general')),
	CONSTRAINT "notices_severity_check" CHECK ("control"."notices"."severity" in ('info','important','urgent')),
	CONSTRAINT "notices_audience_check" CHECK ("control"."notices"."audience"->>'kind' in ('all','plans','states','tenant')),
	CONSTRAINT "notices_language_check" CHECK (("control"."notices"."title_bn" IS NOT NULL AND "control"."notices"."body_bn" IS NOT NULL) OR ("control"."notices"."title_en" IS NOT NULL AND "control"."notices"."body_en" IS NOT NULL)),
	CONSTRAINT "notices_ends_check" CHECK ("control"."notices"."ends_at" IS NULL OR "control"."notices"."publish_at" IS NULL OR "control"."notices"."ends_at" > "control"."notices"."publish_at"),
	CONSTRAINT "notices_window_check" CHECK (("control"."notices"."window_starts_at" IS NULL) = ("control"."notices"."window_ends_at" IS NULL) AND ("control"."notices"."window_ends_at" IS NULL OR "control"."notices"."window_ends_at" > "control"."notices"."window_starts_at"))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."notice_acknowledgments" ADD CONSTRAINT "notice_acknowledgments_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "control"."notices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."notice_acknowledgments" ADD CONSTRAINT "notice_acknowledgments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."notice_deliveries" ADD CONSTRAINT "notice_deliveries_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "control"."notices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."notice_deliveries" ADD CONSTRAINT "notice_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."notice_reads" ADD CONSTRAINT "notice_reads_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "control"."notices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."notice_reads" ADD CONSTRAINT "notice_reads_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "tenant"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."notice_versions" ADD CONSTRAINT "notice_versions_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "control"."notices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."notices" ADD CONSTRAINT "notices_rate_change_id_rate_history_id_fk" FOREIGN KEY ("rate_change_id") REFERENCES "control"."rate_history"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notice_deliveries_tenant_idx" ON "control"."notice_deliveries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notice_reads_user_idx" ON "control"."notice_reads" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notice_versions_notice_idx" ON "control"."notice_versions" USING btree ("notice_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notices_publish_idx" ON "control"."notices" USING btree ("publish_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notices_due_idx" ON "control"."notices" USING btree ("publish_at") WHERE "control"."notices"."sent_at" IS NULL AND "control"."notices"."withdrawn_at" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.notices TO lytronix_app;
    GRANT SELECT, INSERT ON control.notice_versions TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE control.notice_versions_id_seq TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.notice_reads TO lytronix_app;
    GRANT SELECT, INSERT ON control.notice_acknowledgments TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.notice_deliveries TO lytronix_app;
    -- RAT-09, NTC-13: publishing a notice writes it onto the rate change it tells of; nothing else of a change is changed.
    GRANT UPDATE (notice_id) ON control.rate_history TO lytronix_app;
  END IF;
END $$;

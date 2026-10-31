CREATE TYPE "control"."payment_page_report_reason" AS ENUM('asked_for_pin', 'wrong_shop', 'wrong_amount', 'other');--> statement-breakpoint
CREATE TYPE "control"."payment_page_report_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."payment_page_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref" varchar(32) NOT NULL,
	"reason" "control"."payment_page_report_reason" NOT NULL,
	"note" varchar(500),
	"ip" "inet",
	"status" "control"."payment_page_report_status" DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "payment_page_suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "payment_page_suspended_reason" text;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "refused_sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."payment_page_reports" ADD CONSTRAINT "payment_page_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_page_reports_status_idx" ON "control"."payment_page_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_page_reports_tenant_idx" ON "control"."payment_page_reports" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_page_reports_ip_idx" ON "control"."payment_page_reports" USING btree ("ip","created_at");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written grants (not expressible in Drizzle). Phase 5 Slice 5.2b, TVR-02, TVR-03, ADM-12, agreed 2026-10-31.
-- ---------------------------------------------------------------------------------------------

-- The application role records a shopper's report, the operator dismisses or acts on it, and the day-60 deletion
-- removes a shop's. The suspension columns are on control.tenants, which the role already updates.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.payment_page_reports TO lytronix_app;
  END IF;
END $$;

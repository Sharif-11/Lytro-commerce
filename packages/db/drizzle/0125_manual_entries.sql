CREATE TABLE IF NOT EXISTS "control"."payment_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "payment_evidence_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."manual_payment_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_payment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"wallet_id" uuid,
	"transaction_id" text,
	"sender_number" text,
	"paid_at" timestamp with time zone,
	"evidence_id" uuid,
	"evidence_line" text,
	"reason" text NOT NULL,
	"entered_by" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reverses_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_payment_entries_evidence_check" CHECK ("control"."manual_payment_entries"."reverses_entry_id" IS NOT NULL OR (
        "control"."manual_payment_entries"."wallet_id" IS NOT NULL AND "control"."manual_payment_entries"."transaction_id" IS NOT NULL AND "control"."manual_payment_entries"."sender_number" IS NOT NULL
        AND "control"."manual_payment_entries"."paid_at" IS NOT NULL AND ("control"."manual_payment_entries"."evidence_id" IS NOT NULL OR "control"."manual_payment_entries"."evidence_line" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "control"."invoices" DROP CONSTRAINT "invoices_kind_check";--> statement-breakpoint
DROP INDEX IF EXISTS "control"."plan_payments_transaction_id_idx";--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "recorded_by_platform" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "reverses_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "recorded_by_platform" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "evidence_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."payment_evidence" ADD CONSTRAINT "payment_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."manual_payment_entries" ADD CONSTRAINT "manual_payment_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."manual_payment_entries" ADD CONSTRAINT "manual_payment_entries_plan_payment_id_plan_payments_id_fk" FOREIGN KEY ("plan_payment_id") REFERENCES "control"."plan_payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."manual_payment_entries" ADD CONSTRAINT "manual_payment_entries_wallet_id_platform_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "control"."platform_wallets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."manual_payment_entries" ADD CONSTRAINT "manual_payment_entries_evidence_id_payment_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "control"."payment_evidence"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."manual_payment_entries" ADD CONSTRAINT "manual_payment_entries_reverses_entry_id_manual_payment_entries_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "control"."manual_payment_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_evidence_due_idx" ON "control"."payment_evidence" USING btree ("created_at") WHERE "control"."payment_evidence"."removed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "manual_payment_entries_reverses_idx" ON "control"."manual_payment_entries" USING btree ("reverses_entry_id") WHERE "control"."manual_payment_entries"."reverses_entry_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_payment_entries_transaction_idx" ON "control"."manual_payment_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_payment_entries_created_idx" ON "control"."manual_payment_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_payment_entries_tenant_idx" ON "control"."manual_payment_entries" USING btree ("tenant_id","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_payments" ADD CONSTRAINT "plan_payments_evidence_id_payment_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "control"."payment_evidence"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_payments_transaction_id_idx" ON "control"."plan_payments" USING btree ("transaction_id") WHERE "control"."plan_payments"."transaction_id" IS NOT NULL AND "control"."plan_payments"."status" NOT IN ('rejected', 'reversed');--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD CONSTRAINT "invoices_kind_check" CHECK ("control"."invoices"."kind" in ('purchase','renewal','upgrade','addon','credit_note'));
--> statement-breakpoint
-- ADM-15, D8-14, D8-47 (Phase 8 Slice 8.5): a manual entry is append-only, so the app can only read and add one, and a
-- reversal is its own row. A payment screenshot's row is marked when its file is removed after two years.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON control.manual_payment_entries TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.payment_evidence TO lytronix_app;
  END IF;
END $$;

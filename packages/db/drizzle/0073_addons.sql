ALTER TYPE "tenant"."ledger_entry_type" ADD VALUE IF NOT EXISTS 'addon';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	CONSTRAINT "invoice_lines_position_key" UNIQUE("invoice_id","position"),
	CONSTRAINT "invoice_lines_kind_check" CHECK ("control"."invoice_lines"."kind" in ('plan','addon','credit'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."addon_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"addon_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"limit_key" text,
	"unit_size" integer,
	"quantity" integer DEFAULT 1 NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_from" text NOT NULL,
	"plan_payment_id" uuid,
	"renews" boolean DEFAULT true NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "addon_purchases_status_check" CHECK ("control"."addon_purchases"."status" in ('pending','active','lapsed')),
	CONSTRAINT "addon_purchases_paid_from_check" CHECK ("control"."addon_purchases"."paid_from" in ('balance','wallet')),
	CONSTRAINT "addon_purchases_quantity_check" CHECK ("control"."addon_purchases"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"limit_key" text,
	"unit_size" integer,
	"price" numeric(10, 2) NOT NULL,
	"label_en" text NOT NULL,
	"label_bn" text NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addons_key_unique" UNIQUE("key"),
	CONSTRAINT "addons_kind_check" CHECK ("control"."addons"."kind" in ('limit','pack','feature','allowance'))
);
--> statement-breakpoint
ALTER TABLE "control"."invoices" DROP CONSTRAINT "invoices_kind_check";--> statement-breakpoint
ALTER TABLE "control"."invoices" ALTER COLUMN "plan_snapshot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."invoices" ALTER COLUMN "billing_term_label" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "control"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."addon_purchases" ADD CONSTRAINT "addon_purchases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."addon_purchases" ADD CONSTRAINT "addon_purchases_addon_id_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "control"."addons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."addon_purchases" ADD CONSTRAINT "addon_purchases_plan_payment_id_plan_payments_id_fk" FOREIGN KEY ("plan_payment_id") REFERENCES "control"."plan_payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addon_purchases_tenant_idx" ON "control"."addon_purchases" USING btree ("tenant_id","status","expires_at");--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD CONSTRAINT "invoices_kind_check" CHECK ("control"."invoices"."kind" in ('purchase','renewal','upgrade','addon'));--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: grants and the catalogue. Phase 3 Slice 10a (PLN-13, PLN-14, BIL-12).
-- ---------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.addons, control.addon_purchases TO lytronix_app;
    GRANT SELECT, INSERT ON control.invoice_lines TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- PLN-13, OD-04 (agreed for Slice 10a): the catalogue's placeholder prices, whole taka -- a month of a limit or feature
-- add-on, or one pack. Units are in each limit's own unit (storage in MB, bandwidth in GB). Editable data.
INSERT INTO control.addons (key, kind, limit_key, unit_size, price, label_en, label_bn) VALUES
  ('extra_products', 'limit', 'products', 500, 149, 'Extra products', 'এক্সট্রা প্রোডাক্ট'),
  ('extra_seat', 'limit', 'staff', 1, 49, 'Extra seat', 'এক্সট্রা সিট'),
  ('extra_storage', 'limit', 'storage_mb', 1024, 29, 'Extra storage', 'এক্সট্রা স্টোরেজ'),
  ('brand_identity', 'feature', NULL, NULL, 149, 'Brand identity', 'ব্র্যান্ড আইডেন্টিটি'),
  ('bandwidth_pack', 'pack', 'bandwidth_gb', 10, 30, 'Bandwidth pack', 'ব্যান্ডউইথ প্যাক'),
  ('request_pack', 'pack', 'requests_monthly', 100000, 20, 'API request pack', 'API রিকোয়েস্ট প্যাক')
ON CONFLICT (key) DO NOTHING;

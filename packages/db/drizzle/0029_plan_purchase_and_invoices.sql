CREATE TABLE IF NOT EXISTS "control"."invoice_counters" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"next_number" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"kind" text NOT NULL,
	"plan_snapshot" jsonb NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"credit_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"billing_term_label" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_kind_check" CHECK ("control"."invoices"."kind" in ('purchase','renewal','upgrade'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."plan_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"plan_id" uuid,
	"billing_term_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"credit_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"quoted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sender_number" text,
	"transaction_id" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."used_transaction_ids" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_payments" ADD CONSTRAINT "plan_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_payments" ADD CONSTRAINT "plan_payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "control"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_payments" ADD CONSTRAINT "plan_payments_billing_term_id_billing_terms_id_fk" FOREIGN KEY ("billing_term_id") REFERENCES "control"."billing_terms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_payments_transaction_id_idx" ON "control"."plan_payments" USING btree ("transaction_id") WHERE "control"."plan_payments"."transaction_id" is not null;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Application role grants (control-schema, no RLS -- platform-wide data), same pattern as 0027.
-- ---------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.invoice_counters TO lytronix_app;
    GRANT SELECT, INSERT ON control.invoices TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.plan_payments TO lytronix_app;
    GRANT SELECT, INSERT ON control.used_transaction_ids TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.idempotency_keys TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written seed data (not expressible in Drizzle). Reviewed with the schema change above.
-- ---------------------------------------------------------------------------------------------

-- DAT-07/BIL-12: the single counter row invoice numbers are taken from, starting at 1.
INSERT INTO control.invoice_counters (id, next_number) VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- BAL-04: top-up amount bounds in TK, read at quote time by the balance module.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('top_up_min_amount', '100', 'The smallest amount a tenant may top up in one payment, in TK (BAL-04).'),
  ('top_up_max_amount', '50000', 'The largest amount a tenant may top up in one payment, in TK (BAL-04).')
ON CONFLICT (key) DO NOTHING;
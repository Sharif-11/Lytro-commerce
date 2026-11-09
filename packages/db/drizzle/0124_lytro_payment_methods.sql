CREATE TABLE IF NOT EXISTS "control"."platform_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"branch" text,
	"routing_number" text,
	"swift_code" text,
	"instructions" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."platform_gateway_accounts" (
	"method" text PRIMARY KEY NOT NULL,
	"number" varchar(20) NOT NULL,
	"credentials" "bytea" NOT NULL,
	"sandbox" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."platform_gateway_uses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"action" text NOT NULL,
	"payment_id" uuid,
	"succeeded" boolean NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."platform_payment_methods" (
	"method" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"way" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "page_ref" varchar(32);--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "page_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "page_from" text;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "pay_method" text;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "id_changes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "gateway_payment_id" text;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "gateway_url" text;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "gateway_result" text;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_gateway_uses_action_at_idx" ON "control"."platform_gateway_uses" USING btree ("method","action","at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_payments_page_ref_idx" ON "control"."plan_payments" USING btree ("page_ref") WHERE "control"."plan_payments"."page_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_payments_gateway_due_idx" ON "control"."plan_payments" USING btree ("page_expires_at") WHERE "control"."plan_payments"."gateway_payment_id" IS NOT NULL AND "control"."plan_payments"."status" = 'pending' AND "control"."plan_payments"."transaction_id" IS NULL;--> statement-breakpoint
-- OPERATOR-CONSOLE-DESIGN §10, ADM-10: what shops may pay Lytro by, and each use of Lytro's own bKash keys.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.platform_payment_methods TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.platform_bank_accounts TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.platform_gateway_accounts TO lytronix_app;
    GRANT SELECT, INSERT ON control.platform_gateway_uses TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE control.platform_gateway_uses_id_seq TO lytronix_app;
  END IF;
END $$;

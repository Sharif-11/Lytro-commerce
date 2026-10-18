-- BIL-12: everything an invoice states, copied at issue (shop and owner name, plan and version, period dates,
-- discount, payment method and reference). Nullable for invoices issued before this migration.
ALTER TABLE "control"."invoices" ADD COLUMN "shop_name" text;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "plan_name" text;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "plan_version" integer;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "payment_reference" text;
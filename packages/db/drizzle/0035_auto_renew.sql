ALTER TABLE "control"."tenants" ADD COLUMN "billing_term_id" uuid;--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "auto_renew_enabled" boolean DEFAULT false NOT NULL;
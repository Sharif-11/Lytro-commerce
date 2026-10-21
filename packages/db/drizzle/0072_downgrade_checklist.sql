ALTER TABLE "control"."tenants" ADD COLUMN "downgraded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "downgrade_over_limit" jsonb;--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "downgrade_final_warning_at" timestamp with time zone;
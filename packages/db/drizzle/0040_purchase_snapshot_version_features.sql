ALTER TABLE "control"."tenants" ADD COLUMN "plan_version_snapshot" integer;--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "feature_snapshot" jsonb;
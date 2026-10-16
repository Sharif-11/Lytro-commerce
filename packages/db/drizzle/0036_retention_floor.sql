ALTER TABLE "control"."tenants" ADD COLUMN "retention_floor_days" integer;--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "retention_floor_until" timestamp with time zone;
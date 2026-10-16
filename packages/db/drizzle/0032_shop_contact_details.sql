ALTER TABLE "control"."tenants" ADD COLUMN "contact_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "contact_email" varchar(254);--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "business_address" text;
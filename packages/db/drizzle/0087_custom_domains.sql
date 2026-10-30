ALTER TABLE "control"."tenant_domains" DROP CONSTRAINT "tenant_domains_hostname_unique";--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: Slice 13. Every domain's twin (megh.com and www.megh.com), filled in for any row added before this
-- slice, then required.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "control"."tenant_domains" ADD COLUMN "twin" text;--> statement-breakpoint
UPDATE "control"."tenant_domains"
  SET "twin" = CASE WHEN "hostname" LIKE 'www.%' THEN substr("hostname", 5) ELSE 'www.' || "hostname" END;--> statement-breakpoint
ALTER TABLE "control"."tenant_domains" ALTER COLUMN "twin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."tenant_domains" ADD COLUMN "twin_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."tenant_domains" ADD COLUMN "pending_since" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."tenant_domains" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."tenant_domains" ADD COLUMN "missed_checks" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."tenant_domains" ADD COLUMN "lost_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."tenant_domains" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_domains_active_hostname" ON "control"."tenant_domains" USING btree ("hostname") WHERE "control"."tenant_domains"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_domains_one_per_shop" ON "control"."tenant_domains" USING btree ("tenant_id") WHERE "control"."tenant_domains"."status" <> 'removed';

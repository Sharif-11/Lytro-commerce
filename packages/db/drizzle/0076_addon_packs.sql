ALTER TABLE "control"."tenants" ADD COLUMN "auto_buy_bandwidth" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "auto_buy_requests" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "pack_used" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "pack_free" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "auto_packs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "auto_buy_state" text;--> statement-breakpoint
ALTER TABLE "control"."media_bandwidth" ADD COLUMN "pack_used" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."media_bandwidth" ADD COLUMN "pack_free" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."media_bandwidth" ADD COLUMN "auto_packs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."media_bandwidth" ADD COLUMN "auto_buy_state" text;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD CONSTRAINT "api_usage_packs_check" CHECK ("control"."api_usage"."pack_used" >= 0 AND "control"."api_usage"."pack_free" >= 0 AND "control"."api_usage"."auto_packs" >= 0 AND ("control"."api_usage"."auto_buy_state" IS NULL OR "control"."api_usage"."auto_buy_state" IN ('requested', 'failed')));--> statement-breakpoint
ALTER TABLE "control"."media_bandwidth" ADD CONSTRAINT "media_bandwidth_packs_check" CHECK ("control"."media_bandwidth"."pack_used" >= 0 AND "control"."media_bandwidth"."pack_free" >= 0 AND "control"."media_bandwidth"."auto_packs" >= 0 AND ("control"."media_bandwidth"."auto_buy_state" IS NULL OR "control"."media_bandwidth"."auto_buy_state" IN ('requested', 'failed')));
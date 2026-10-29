ALTER TABLE "tenant"."shop_settings" ADD COLUMN "storefront_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_keys" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "control"."api_keys" ADD COLUMN "sealed_value" "bytea";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_storefront_idx" ON "control"."api_keys" USING btree ("tenant_id") WHERE "control"."api_keys"."purpose" = 'storefront' AND "control"."api_keys"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "control"."api_keys" ADD CONSTRAINT "api_keys_purpose_check" CHECK (("control"."api_keys"."purpose" IS NULL OR "control"."api_keys"."purpose" IN ('storefront')) AND ("control"."api_keys"."purpose" IS NULL) = ("control"."api_keys"."sealed_value" IS NULL));
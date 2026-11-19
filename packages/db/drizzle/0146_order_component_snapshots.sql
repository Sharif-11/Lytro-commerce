-- The owner, 2026-11-19: each item inside a combo shows its own SKU, unit and photo, copied at order time as the
-- line's are. Nullable: components ordered before keep null and show the variant's current ones.
ALTER TABLE "tenant"."order_line_components" ADD COLUMN "sku" varchar(64);--> statement-breakpoint
ALTER TABLE "tenant"."order_line_components" ADD COLUMN "stock_unit" "tenant"."stock_unit";--> statement-breakpoint
ALTER TABLE "tenant"."order_line_components" ADD COLUMN "thumbnail_media_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."order_line_components" ADD COLUMN "thumbnail_url" text;
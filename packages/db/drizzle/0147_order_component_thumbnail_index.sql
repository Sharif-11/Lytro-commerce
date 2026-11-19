-- outside-transaction
-- The owner, 2026-11-19: a combo's items now keep their photo as ordered (0146). ATR-20 (PD-8) keeps a photo while any
-- order shows it, so deleting one reads these as it reads the lines' photos.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "order_line_components_thumbnail_idx" ON "tenant"."order_line_components" USING btree ("tenant_id","thumbnail_media_id") WHERE "tenant"."order_line_components"."thumbnail_media_id" IS NOT NULL;

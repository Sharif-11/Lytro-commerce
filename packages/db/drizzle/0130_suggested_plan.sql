ALTER TABLE "control"."plans" ADD COLUMN "suggested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_one_suggested_idx" ON "control"."plans" USING btree ("suggested") WHERE "control"."plans"."suggested";--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------------------------
-- Hand-written: the first suggested plan (PLN-21). The user, 2026-11-13: "the starter is the suggested plan". Only a
-- plan on the pricing page can be suggested, and only when none is yet.
-- ---------------------------------------------------------------------------------------------------------------
UPDATE "control"."plans" SET "suggested" = true
WHERE "name" = 'Starter' AND "for_sale"
  AND NOT EXISTS (SELECT 1 FROM "control"."plans" WHERE "suggested");

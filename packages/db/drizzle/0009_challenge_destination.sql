ALTER TABLE "control"."verification_challenges" RENAME COLUMN "phone" TO "destination";--> statement-breakpoint
DROP INDEX IF EXISTS "verification_challenges_phone_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_challenges_destination_idx" ON "control"."verification_challenges" USING btree ("destination","created_at");
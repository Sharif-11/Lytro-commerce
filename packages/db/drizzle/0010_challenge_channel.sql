DROP INDEX IF EXISTS "verification_challenges_destination_idx";--> statement-breakpoint
ALTER TABLE "control"."verification_challenges" ADD COLUMN "channel" text DEFAULT 'sms' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_challenges_destination_idx" ON "control"."verification_challenges" USING btree ("destination","channel","created_at");
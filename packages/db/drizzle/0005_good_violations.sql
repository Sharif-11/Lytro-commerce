ALTER TABLE "control"."verification_challenges" RENAME COLUMN "purpose" TO "kind";--> statement-breakpoint
UPDATE "control"."verification_challenges" SET "kind" = 'signin' WHERE "kind" = 'signup';--> statement-breakpoint
ALTER TABLE "control"."verification_challenges" ALTER COLUMN "kind" SET DEFAULT 'signin';--> statement-breakpoint
ALTER TABLE "control"."sessions" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."subscribers" ADD COLUMN "sign_in_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."subscribers" ADD COLUMN "sign_in_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."sessions" ADD COLUMN "must_set_password" boolean DEFAULT false NOT NULL;
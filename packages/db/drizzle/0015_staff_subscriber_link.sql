ALTER TABLE "tenant"."users" ADD COLUMN "subscriber_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."users" ADD CONSTRAINT "users_subscriber_key" UNIQUE("subscriber_id");
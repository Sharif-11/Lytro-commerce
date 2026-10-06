CREATE TABLE IF NOT EXISTS "control"."sign_in_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."sign_in_failures" ADD CONSTRAINT "sign_in_failures_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "control"."subscribers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sign_in_failures_subscriber_idx" ON "control"."sign_in_failures" USING btree ("subscriber_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sign_in_failures_ip_idx" ON "control"."sign_in_failures" USING btree ("ip","created_at");--> statement-breakpoint
ALTER TABLE "control"."subscribers" DROP COLUMN IF EXISTS "sign_in_failures";--> statement-breakpoint
ALTER TABLE "control"."subscribers" DROP COLUMN IF EXISTS "sign_in_locked_until";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON control.sign_in_failures TO lytronix_app;
  END IF;
END $$;

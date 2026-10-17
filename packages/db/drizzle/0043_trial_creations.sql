CREATE TABLE IF NOT EXISTS "control"."trial_creations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."trial_creations" ADD CONSTRAINT "trial_creations_identity_id_subscriber_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "control"."subscriber_identities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trial_creations_identity_idx" ON "control"."trial_creations" USING btree ("identity_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trial_creations_ip_idx" ON "control"."trial_creations" USING btree ("ip","created_at");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON control.trial_creations TO lytronix_app;
  END IF;
END $$;
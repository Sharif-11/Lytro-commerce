CREATE TABLE IF NOT EXISTS "control"."signup_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" "inet" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_attempts_ip_idx" ON "control"."signup_attempts" USING btree ("ip","created_at");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON control.signup_attempts TO lytronix_app;
  END IF;
END $$;

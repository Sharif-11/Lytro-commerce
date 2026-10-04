CREATE TABLE IF NOT EXISTS "control"."sms_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"to_phone" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."verification_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"purpose" text DEFAULT 'signup' NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_outbox_created_idx" ON "control"."sms_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_challenges_phone_idx" ON "control"."verification_challenges" USING btree ("phone","created_at");
--> statement-breakpoint
-- D3, SRS §2.1: the Trial and Starter plans, with limits as data. Trial is not for sale, so its rank
-- does not compete with Starter for PLN-16's uniqueness. Limits not stated in the plan sheet are omitted.
INSERT INTO control.plans (name, rank, for_sale, version, limits, features) VALUES
  ('Trial', 0, false, 1,
   '{"products": 20, "orders_total": 40, "staff": 1, "paired_devices": 1, "storage_mb": 200, "bandwidth_gb": 5, "essential_sms_total": 8}',
   '{}'),
  ('Starter', 1, true, 1,
   '{"products": 100, "orders_handled_monthly": 300, "paired_devices": 1, "storage_mb": 2048, "bandwidth_gb": 30, "essential_sms_monthly": 10}',
   '{}');
--> statement-breakpoint
-- Application role grants (see the note in 0001). Each new table needs its grants here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.verification_challenges TO lytronix_app;
    GRANT SELECT, INSERT ON control.sms_outbox TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE control.sms_outbox_id_seq TO lytronix_app;
  END IF;
END $$;
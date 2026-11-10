CREATE TABLE IF NOT EXISTS "control"."payment_method_types" (
	"method" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"retiring_since" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written grants (not expressible in Drizzle). Phase 8 Slice 8.7, read agreed 2026-11-10.
-- ---------------------------------------------------------------------------------------------

-- WAL-18, D8-65 to D8-67: each payment method type's platform-wide state, read before any tenant context exists and held
-- shared while a shop switches a type on; never deleted.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.payment_method_types TO lytronix_app;
  END IF;
END $$;

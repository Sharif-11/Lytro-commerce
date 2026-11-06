CREATE TABLE IF NOT EXISTS "control"."courier_adapters" (
	"courier_key" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"suggested_key" text,
	"retiring_since" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written grants (not expressible in Drizzle). Phase 6 Slice 6.6, read agreed 2026-11-06.
-- ---------------------------------------------------------------------------------------------

-- CRR-23 to CRR-25: each courier's platform-wide state, read before any tenant context exists; never deleted.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.courier_adapters TO lytronix_app;
  END IF;
END $$;

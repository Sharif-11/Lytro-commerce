CREATE TABLE IF NOT EXISTS "control"."reserved_slugs" (
	"slug" varchar(30) PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- TEN-26 / AUTH-11: the initial reserved list. Editable data; the list is the union of the SRS
-- lists plus the platform's own names (decision R4).
INSERT INTO control.reserved_slugs (slug, reason) VALUES
  ('admin', 'platform'), ('api', 'platform'), ('www', 'platform'), ('app', 'platform'),
  ('dashboard', 'platform'), ('media', 'platform'), ('pay', 'platform'), ('status', 'platform'),
  ('static', 'platform'), ('mail', 'platform'), ('cdn', 'platform'), ('assets', 'platform'),
  ('support', 'platform'), ('platform', 'platform'), ('lytronix', 'platform')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
-- TEN-19 / AUTH-11: a shop's slug is set once and never changes, whatever role runs the update.
-- The application also never writes it; this trigger is the guarantee.
CREATE OR REPLACE FUNCTION control.reject_slug_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tenant slug is immutable (tenant %)', OLD.id;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tenants_slug_immutable
  BEFORE UPDATE OF slug ON control.tenants
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION control.reject_slug_change();
--> statement-breakpoint
-- Application role grants for this migration (see the note in 0001).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT ON control.reserved_slugs TO lytronix_app;
  END IF;
END $$;

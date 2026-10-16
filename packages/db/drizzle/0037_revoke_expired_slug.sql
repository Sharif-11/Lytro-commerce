-- LIF-21: the slug-immutability trigger (migration 0002) unconditionally rejects every update to
-- control.tenants.slug, for TEN-19's own guarantee ("no action... ever changes it"). That guarantee stays
-- exactly as absolute as it is today for any tenant still live (deleted_at IS NULL) -- the WHEN clause below
-- only opens a narrow exception for a tenant already deleted 30+ days ago, the one case LIF-21 needs: the
-- old subdomain is released so a different subscriber can claim it.
DROP TRIGGER IF EXISTS tenants_slug_immutable ON control.tenants;
--> statement-breakpoint
CREATE TRIGGER tenants_slug_immutable
  BEFORE UPDATE OF slug ON control.tenants
  FOR EACH ROW
  WHEN (
    OLD.slug IS DISTINCT FROM NEW.slug
    AND NOT (OLD.deleted_at IS NOT NULL AND OLD.deleted_at < now() - interval '30 days')
  )
  EXECUTE FUNCTION control.reject_slug_change();

-- SCL-08, D25: pg-boss manages its own schema and tables, versioned by the library itself. CREATE SCHEMA needs
-- database-level CREATE in Postgres — checked before it even looks at whether the schema exists — which the app
-- role never has (create-app-role.sql) and does not get here either. The schema is created once, separately, by
-- the schema-owner credential migrations already use (packages/db/src/bootstrap-queue.ts, run before the app
-- starts and again on any pg-boss upgrade), the same category as a migration, never from the live app.
--
-- This migration only grants the app role ordinary use of what that bootstrap creates: USAGE on the schema, and
-- default privileges so every table the schema owner creates there (now or on a later pg-boss upgrade) is usable
-- by the app role without a further grant.
CREATE SCHEMA IF NOT EXISTS pgboss;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT USAGE ON SCHEMA pgboss TO lytronix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lytronix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO lytronix_app;
  END IF;
END $$;

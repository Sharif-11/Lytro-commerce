-- Creates the application role. Run once per database, as a superuser, before the first migration.
-- The application connects as this role. It must never be a superuser and must never have BYPASSRLS,
-- otherwise row-level security does not apply and tenant isolation is not enforced (DAT-03).
-- Local development password only; production credentials come from the secrets store (DAT-14).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    CREATE ROLE lytronix_app LOGIN PASSWORD 'lytronix_app_local_only'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
GRANT CONNECT ON DATABASE lytronix TO lytronix_app;

-- The read pool's role (Slice 9.2, D9-13, DAT-45): SELECT only, and every transaction read-only by default. Optional on
-- a developer's database: without it the server reads through the application role. Its grants follow the
-- application role's after each migration run (packages/db/src/read-role.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_read') THEN
    CREATE ROLE lytronix_read LOGIN PASSWORD 'lytronix_read_local_only'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
ALTER ROLE lytronix_read SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE lytronix TO lytronix_read;

#!/bin/sh
# Runs once, when PostgreSQL starts on an empty data volume (the image's /docker-entrypoint-initdb.d), as the owner
# role: makes the role the application connects as, before the first migration, since every migration grants to it
# only if it exists (DAT-03, DAT-14). Never a superuser and never BYPASSRLS, or row-level security wouldn't apply. Its
# password comes from LYTRO_APP_DB_PASSWORD in the server's root-only postgres.env (deploy/README.md); the same password
# is in the API's DATABASE_URL in server.env.
#
# And the read pool's role (Slice 9.2, D9-13, DAT-45): SELECT only, on whatever the application role may read (the
# migration runner grants it after every run), and every transaction read-only unless it says otherwise. Row-level
# security applies to it as to the application. Its password is LYTRO_READ_DB_PASSWORD.
set -eu

: "${LYTRO_APP_DB_PASSWORD:?set LYTRO_APP_DB_PASSWORD in postgres.env}"
: "${LYTRO_READ_DB_PASSWORD:?set LYTRO_READ_DB_PASSWORD in postgres.env}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set app_password="$LYTRO_APP_DB_PASSWORD" --set read_password="$LYTRO_READ_DB_PASSWORD" \
  --set app_database="$POSTGRES_DB" <<'SQL'
SELECT format(
  'CREATE ROLE lytronix_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO lytronix_app', :'app_database') \gexec
SELECT format(
  'CREATE ROLE lytronix_read LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  :'read_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_read') \gexec
ALTER ROLE lytronix_read SET default_transaction_read_only = on;
SELECT format('GRANT CONNECT ON DATABASE %I TO lytronix_read', :'app_database') \gexec
SQL

#!/bin/sh
# Runs once, when PostgreSQL starts on an empty data volume (the image's /docker-entrypoint-initdb.d), as the owner
# role: makes the role the application connects as, before the first migration, since every migration grants to it
# only if it exists (DAT-03, DAT-14). Never a superuser and never BYPASSRLS, or row-level security wouldn't apply. Its
# password comes from LYTRO_APP_DB_PASSWORD in the server's root-only postgres.env (deploy/README.md); the same password
# is in the API's DATABASE_URL in server.env.
set -eu

: "${LYTRO_APP_DB_PASSWORD:?set LYTRO_APP_DB_PASSWORD in postgres.env}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set app_password="$LYTRO_APP_DB_PASSWORD" --set app_database="$POSTGRES_DB" <<'SQL'
SELECT format(
  'CREATE ROLE lytronix_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO lytronix_app', :'app_database') \gexec
SQL

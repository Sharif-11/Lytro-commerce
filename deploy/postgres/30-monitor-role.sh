#!/bin/sh
# OBS-05, DAT-25 (Phase 9 Slice 9.6): the role the monitor (deploy/alloy) reads the database's figures as: pg_monitor,
# its statistics and settings, never a table's rows. Made, and its password kept to LYTRO_MONITOR_DB_PASSWORD in
# postgres.env, when an empty database first starts and on every deploy (deploy.sh step 4). Without the password, as on
# a server whose settings predate Slice 9.6 until make-env.sh is run again, there's no role and nothing to monitor with.
set -eu

[ -n "${LYTRO_MONITOR_DB_PASSWORD:-}" ] || exit 0

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set monitor_password="$LYTRO_MONITOR_DB_PASSWORD" --set app_database="$POSTGRES_DB" <<'SQL'
SELECT format(
  'CREATE ROLE lytronix_monitor LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  :'monitor_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_monitor') \gexec
SELECT format('ALTER ROLE lytronix_monitor PASSWORD %L', :'monitor_password') \gexec
GRANT pg_monitor TO lytronix_monitor;
SELECT format('GRANT CONNECT ON DATABASE %I TO lytronix_monitor', :'app_database') \gexec
SQL

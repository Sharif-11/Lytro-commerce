#!/bin/sh
# DAT-17 (Phase 9 Slice 9.6): every statement's totals (pg_stat_statements, loaded at start by compose.yml), for the
# slow-query review (RUNBOOKS.md). Runs as the owner when an empty database first starts, and again on every deploy
# (deploy.sh step 4), so a database made before this script gets it too.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SQL

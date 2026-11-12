#!/bin/sh
# The primary's first start (start.sh): a role the standby copies and streams with, allowed in over the network.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --set password="$REPLICA_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD %L', :'password') \gexec
SQL
echo 'host replication replicator all scram-sha-256' >> "$PGDATA/pg_hba.conf"

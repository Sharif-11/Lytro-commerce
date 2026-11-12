#!/bin/sh
# Writes PgBouncer's settings from the environment, then runs it (Phase 9 Slice 9.2, D9-13). From pgbouncer.env, which
# make-env.sh writes on the server:
#
#   PGBOUNCER_APP_PASSWORD    lytronix_app's password: the API's write pool
#   PGBOUNCER_READ_PASSWORD   lytronix_read's password: the API's read pool (SELECT only, read-only by default)
#
# Every connection it opens to PostgreSQL starts with the API's limits (DAT-23): no statement past 10 s, and no
# transaction open past 5 s (PostgreSQL 17's transaction_timeout). They are set here, not by the API: in transaction mode
# PgBouncer refuses or drops a limit sent when a client connects, and the worker, which connects directly, keeps its own.
set -eu

: "${PGBOUNCER_APP_PASSWORD:?set it in pgbouncer.env}"
: "${PGBOUNCER_READ_PASSWORD:?set it in pgbouncer.env}"
DB_HOST="${DB_HOST:-postgres}"
DB_NAME="${DB_NAME:-lytronix}"
STATEMENT_MS="${API_STATEMENT_TIMEOUT_MS:-10000}"
TRANSACTION_MS="${API_TRANSACTION_TIMEOUT_MS:-5000}"
RUN_DIR=/etc/pgbouncer/run

case "$STATEMENT_MS$TRANSACTION_MS" in
  *[!0-9]*) echo 'the timeouts are whole milliseconds' >&2; exit 1 ;;
esac

umask 077
# The passwords are hex (make-env.sh), so they need no quoting beyond the file's own.
printf '"lytronix_app" "%s"\n"lytronix_read" "%s"\n' "$PGBOUNCER_APP_PASSWORD" "$PGBOUNCER_READ_PASSWORD" \
  > "$RUN_DIR/userlist.txt"

cat > "$RUN_DIR/pgbouncer.ini" << EOF
[databases]
$DB_NAME = host=$DB_HOST port=5432 dbname=$DB_NAME connect_query='SET statement_timeout = $STATEMENT_MS; SET transaction_timeout = $TRANSACTION_MS'

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
unix_socket_dir =
auth_type = scram-sha-256
auth_file = $RUN_DIR/userlist.txt
; The tenant is set per transaction (set_config(..., true)), and nothing in the API keeps session state, so a server
; connection can serve another client between transactions.
pool_mode = transaction
server_reset_query =
; Some drivers send it (JDBC, psycopg); PgBouncer needn't pass it on, and would refuse the connection otherwise.
ignore_startup_parameters = extra_float_digits
; Both API processes, each with a write and a read pool of DATABASE_POOL_MAX: well under max_client_conn. Each role's
; pool to PostgreSQL stays small, so the worker and pg-boss always find connections left (DAT-11).
max_client_conn = ${MAX_CLIENT_CONN:-100}
default_pool_size = ${DEFAULT_POOL_SIZE:-10}
reserve_pool_size = 2
reserve_pool_timeout = 3
server_lifetime = 3600
server_idle_timeout = 300
log_connections = 0
log_disconnections = 0
stats_period = 300
EOF

exec pgbouncer "$RUN_DIR/pgbouncer.ini"

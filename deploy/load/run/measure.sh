#!/usr/bin/env bash
# The server's side of a load test's report (Phase 9 Slice 9.10; DAT-32, DAT-11, SCL-03): every 10 seconds until stopped,
# one line of the machine's CPU, memory, swap and load, PostgreSQL's connections, transactions and buffer cache hit
# ratio, and each container's CPU and memory. On stopping (TERM or INT), the 20 queries that took the most time since it
# started. Run as root on the server under test, usually by run.sh over SSH:
#
#   sudo bash /opt/lytro/state/current/load/run/measure.sh <name>
#
# It writes $LYTRO_HOME/state/load/out/<name>-server.csv, <name>-containers.csv and <name>-queries.txt.
set -euo pipefail

NAME="${1:?a name for this run, e.g. pass}"
LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
DEPLOY_DIR="$(readlink -f "$LYTRO_HOME/state/current")"
OUT="${LOAD_WORK:-$LYTRO_HOME/state/load}/out"
export LYTRO_HOME
set -a
# shellcheck source=/dev/null
. "$LYTRO_HOME/state/release.env"
set +a
# Readable by the deploy group, which the load machine copies them as.
umask 027
install -d -m 750 -o root -g deploy "$OUT"

pg() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/compose.yml" --env-file "$LYTRO_HOME/settings.env" \
    exec -T postgres sh -c 'psql -X -At -F "," -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' psql "$1"
}

# What the slowest queries were, from here on (pg_stat_statements: Slice 9.6's 20-query-statistics.sh).
pg 'SELECT pg_stat_statements_reset()' > /dev/null || true

finish() {
  pg "SELECT round(total_exec_time)::bigint AS total_ms, calls, round(mean_exec_time::numeric, 2) AS mean_ms,
        round(max_exec_time::numeric, 1) AS max_ms, left(regexp_replace(query, '\s+', ' ', 'g'), 300)
      FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20" > "$OUT/$NAME-queries.txt" || true
  exit 0
}
trap finish TERM INT

echo 'time,cpu_busy_pct,mem_used_pct,swap_used_mb,load1,pg_connections,pg_active,pg_waiting,pg_commits,buffer_hit_pct' \
  > "$OUT/$NAME-server.csv"
echo 'time,container,cpu_pct,mem_used' > "$OUT/$NAME-containers.csv"

read -r _ user nice system idle iowait irq softirq _ < /proc/stat
before_busy=$((user + nice + system + irq + softirq))
before_total=$((before_busy + idle + iowait))
while :; do
  sleep 10 &
  wait $!
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  read -r _ user nice system idle iowait irq softirq _ < /proc/stat
  busy=$((user + nice + system + irq + softirq))
  total=$((busy + idle + iowait))
  cpu=$(((busy - before_busy) * 100 / (total - before_total > 0 ? total - before_total : 1)))
  before_busy=$busy
  before_total=$total
  memory="$(free -m | awk '/^Mem:/ {printf "%d", ($2 - $7) * 100 / $2} /^Swap:/ {printf ",%d", $3}')"
  load="$(cut -d' ' -f1 /proc/loadavg)"
  database="$(pg "SELECT (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend'),
      (SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND backend_type = 'client backend'),
      (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'),
      (SELECT xact_commit FROM pg_stat_database WHERE datname = current_database()),
      (SELECT round(100.0 * blks_hit / greatest(blks_hit + blks_read, 1), 2) FROM pg_stat_database WHERE datname = current_database())" || echo ',,,,')"
  echo "$now,$cpu,$memory,$load,$database" >> "$OUT/$NAME-server.csv"
  docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}}' | sed "s/^/$now,/" >> "$OUT/$NAME-containers.csv"
done

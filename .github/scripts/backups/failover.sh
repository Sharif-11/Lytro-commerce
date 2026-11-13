#!/usr/bin/env bash
# Failover and adding a replica, with real PostgreSQL containers (Phase 9 Slice 9.3, D9-2, D9-19, DAT-37, DAT-57; CI's
# `backups` job, after start.sh built lytro-database:ci). A primary; two replicas made by lytro-db-add-replica; then:
#   - lytro-db-failover refuses while the primary still takes writes, and fences nothing
#   - the primary stops; failover promotes a replica, fences the old one, points the other replica at it and switches
#     the apps (stand-in commands that leave marks), and the promoted one takes writes that the other replica replays
#   - the old primary is rebuilt as a replica of the new one (it never comes back as a primary)
# Exits non-zero at the first thing that isn't so.
set -euo pipefail

IMAGE="${BACKUP_TEST_IMAGE:-lytro-database:ci}"
NET=failover-net
PW=ci_only_password
RPW=replica_only
OUT="$(mktemp -d)"
chmod 777 "$OUT"
# The folder as Docker names it (pwd -W on a developer's Windows machine; plain pwd on Linux).
OUT_HOST="$(cd "$OUT" && (pwd -W 2> /dev/null || pwd))"
docker network create "$NET" > /dev/null

# The primary's first start: a role the replicas copy and stream as, let in over the network for replication (as
# .github/scripts/standby/primary-replication.sh does; written here so its line endings are always a Linux file's).
cat > "$OUT/10-replication.sh" << 'EOF'
#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d postgres --set password="$REPLICA_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD %L', :'password') \gexec
SQL
echo 'host replication replicator all scram-sha-256' >> "$PGDATA/pg_hba.conf"
EOF
chmod 755 "$OUT/10-replication.sh"

fail() {
  echo "FAILED: $*" >&2
  for c in fo-p fo-r1 fo-r2 fo-p2; do docker logs --tail 20 "$c" 2>&1 | sed "s/^/[$c] /" >&2 || true; done
  exit 1
}
pg() {
  docker run -d --name "$1" --network "$NET" -e POSTGRES_USER=lytronix -e POSTGRES_PASSWORD=$PW \
    -e REPLICA_PASSWORD=$RPW -v "$1:/var/lib/postgresql/data" "${@:2}" > /dev/null
}
ready() {
  for _ in $(seq 1 60); do
    docker exec "$1" pg_isready -U lytronix -h 127.0.0.1 -q 2> /dev/null && return 0
    sleep 1
  done
  fail "$1 never answered"
}
q() { docker exec -i "$1" psql -X -A -t -q -U lytronix -d postgres -v ON_ERROR_STOP=1 -c "$2"; }
replica() {
  docker run --rm --network "$NET" -e REPLICA_SOURCE="host=$2 user=replicator password=$RPW" -e POSTGRES_USER=lytronix \
    -v "$1:/var/lib/postgresql/data" "$IMAGE" lytro-db-add-replica --wait || fail "add-replica $1 from $2"
  pg "$1" "$IMAGE"
  ready "$1"
  [ "$(q "$1" 'SELECT pg_is_in_recovery()')" = t ] || fail "$1 isn't a replica"
}
failover() {
  docker run --rm --network "$NET" -v "$OUT_HOST:/out" \
    -e FAILOVER_REPLICAS="postgres://lytronix:$PW@fo-r1:5432/postgres postgres://lytronix:$PW@fo-r2:5432/postgres" \
    -e FAILOVER_OLD_PRIMARY="postgres://lytronix:$PW@fo-p:5432/postgres" \
    -e FAILOVER_FENCE='touch /out/fenced' -e FAILOVER_SWITCH='echo {host} > /out/switched' \
    -e FAILOVER_REPLICATION="host={host} user=replicator password=$RPW" "$IMAGE" lytro-db-failover
}

pg fo-p -v "$OUT_HOST/10-replication.sh:/docker-entrypoint-initdb.d/10-replication.sh:ro" "$IMAGE"
ready fo-p
sleep 3
ready fo-p
q fo-p 'CREATE TABLE marks (n int); INSERT INTO marks SELECT generate_series(1, 1000)'
replica fo-r1 fo-p
replica fo-r2 fo-p
q fo-p 'INSERT INTO marks SELECT generate_series(1001, 1500)'
for _ in $(seq 1 30); do
  [ "$(q fo-r1 'SELECT count(*) FROM marks')" = 1500 ] && [ "$(q fo-r2 'SELECT count(*) FROM marks')" = 1500 ] && break
  sleep 1
done
[ "$(q fo-r2 'SELECT count(*) FROM marks')" = 1500 ] || fail 'the replicas never caught up'
echo 'two replicas made and streaming'

if failover; then fail 'failover went ahead while the primary still took writes'; fi
[ ! -e "$OUT/fenced" ] || fail 'a refused failover fenced the primary'
[ "$(q fo-r1 'SELECT pg_is_in_recovery()')" = t ] || fail 'a refused failover promoted a replica'
echo 'refused while the primary took writes; nothing fenced or promoted'

docker stop fo-p > /dev/null
failover || fail 'failover'
[ -e "$OUT/fenced" ] || fail 'the old primary was not fenced'
new="$(cat "$OUT/switched")"
case "$new" in fo-r1) other=fo-r2 ;; fo-r2) other=fo-r1 ;; *) fail "switched to '$new'" ;; esac
[ "$(q "$new" 'SELECT pg_is_in_recovery()')" = f ] || fail "$new wasn't promoted"
q "$new" 'INSERT INTO marks SELECT generate_series(1501, 1600)'
for _ in $(seq 1 30); do
  [ "$(q "$other" 'SELECT count(*) FROM marks')" = 1600 ] && break
  sleep 1
done
[ "$(q "$other" 'SELECT count(*) FROM marks')" = 1600 ] || fail "$other doesn't follow $new"
echo "failed over to $new; $other follows it"

replica fo-p2 "$new"
for _ in $(seq 1 30); do
  [ "$(q fo-p2 'SELECT count(*) FROM marks')" = 1600 ] && break
  sleep 1
done
[ "$(q fo-p2 'SELECT count(*) FROM marks')" = 1600 ] || fail 'the rebuilt old primary has not caught up'
echo 'the old primary rebuilt as a replica of the new one'

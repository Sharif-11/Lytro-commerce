#!/usr/bin/env bash
# A PostgreSQL 17 primary and a standby streaming from it, for apps/server/test/standby.e2e.spec.ts (Slice 9.2,
# exit criterion 5). CI only: the primary on localhost:5441, the standby on localhost:5442, both on a network of their
# own so the standby reaches the primary by name. The standby is made from the primary with pg_basebackup -R, which
# writes its connection back to the primary, and replays everything the primary writes: roles, migrations, rows.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PASSWORD=ci_only_password
REPLICA_PASSWORD=replica_only
# CI runs 17, as the servers do; PG_IMAGE picks another for a check on a developer's machine.
IMAGE="${PG_IMAGE:-postgres:17}"

docker network create standby-net > /dev/null

docker run -d --name pg-primary --network standby-net -p 5441:5432 \
  -e POSTGRES_PASSWORD="$PASSWORD" -e REPLICA_PASSWORD="$REPLICA_PASSWORD" \
  -v "$HERE/primary-replication.sh:/docker-entrypoint-initdb.d/10-replication.sh:ro" \
  "$IMAGE" > /dev/null

# Ready only once the image has run its first-start scripts and restarted for real.
for _ in $(seq 1 60); do
  if docker exec pg-primary pg_isready -U postgres -h 127.0.0.1 -q 2> /dev/null &&
    docker exec pg-primary psql -U postgres -h 127.0.0.1 -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'replicator'" 2> /dev/null | grep -q 1; then
    break
  fi
  sleep 1
done

docker run -d --name pg-standby --network standby-net -p 5442:5432 --user postgres \
  -e PGPASSWORD="$REPLICA_PASSWORD" --entrypoint bash "$IMAGE" -c '
    until pg_basebackup -h pg-primary -U replicator -D /var/lib/postgresql/data -R -X stream; do
      rm -rf /var/lib/postgresql/data/*; sleep 1
    done
    chmod 700 /var/lib/postgresql/data
    exec postgres -c hot_standby=on' > /dev/null

for _ in $(seq 1 60); do
  if docker exec pg-standby psql -U postgres -tAc 'SELECT pg_is_in_recovery()' 2> /dev/null | grep -q t; then
    echo 'the primary on 5441, the standby on 5442, streaming'
    exit 0
  fi
  sleep 1
done
echo 'the standby never started' >&2
docker logs pg-standby >&2 || true
exit 1

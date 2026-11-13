#!/usr/bin/env bash
# Deploys one release to this server (Phase 9 Slice 9.1, D9-12). Run by /opt/lytro/bin/lytro-ssh, the only command
# GitHub's deploy key may run, from the release's own copy of deploy/ (so the compose file is always the release's):
#
#   deploy.sh <release> <edge-tag>
#
# In order, stopping at the first failure (the API keeps answering from whichever process is still on the old release):
#   1. pull the release's images                 5. the worker, then api-1, then api-2, each healthy on <release> before
#   2. the database, Redis and the pooler up        the next is touched, so one API process always answers
#   3. a dump of the database                    6. the dashboard's and console's files, then the edge
#   4. the roles, migrations, pg-boss's schema   7. the website and the storefront
#      and the nightly backups' service
# LYTRO_SKIP_PULL=1 uses images already on this machine (CI's rehearsal builds them there).
# Migrations only add, so the old release keeps working beside the new one while it rolls (ENGINEERING-STANDARDS §7).
# Rolling back is deploying the previous release again.
set -euo pipefail

RELEASE="${1:?usage: deploy.sh <release> <edge-tag>}"
EDGE_TAG="${2:?usage: deploy.sh <release> <edge-tag>}"
LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# How many pre-deploy dumps and release folders to keep.
KEEP_DUMPS=5
KEEP_RELEASES=5

# The pooler's image is tagged by what goes into it, as the edge's is; this release's copy of deploy/ says which. So is
# the database's, with WAL-G and the backup scripts (Slice 9.3).
PGBOUNCER_TAG="$(sh "$DEPLOY_DIR/pgbouncer/image-tag.sh")"
DATABASE_TAG="$(sh "$DEPLOY_DIR/database/image-tag.sh")"

# Point-in-time recovery's archive (Slice 9.3, DAT-34) runs once backup.env holds everything it needs, and not before:
# a server whose backups aren't set up yet (CI's rehearsal) keeps its write-ahead log to itself.
backup_setting() { sed -n "s/^$1=//p" "$LYTRO_HOME/env/backup.env" 2> /dev/null | head -n 1; }
PG_ARCHIVE_MODE=off
if [ -n "$(backup_setting BACKUP_R2_ENDPOINT)" ] && [ -n "$(backup_setting BACKUP_PITR_BUCKET)" ] &&
  [ -n "$(backup_setting BACKUP_PITR_KEY_ID)" ] && [ -n "$(backup_setting BACKUP_PITR_KEY_SECRET)" ] &&
  [ -n "$(backup_setting BACKUP_PITR_ENCRYPTION_KEY)" ]; then
  PG_ARCHIVE_MODE=on
fi

export LYTRO_HOME RELEASE EDGE_TAG PGBOUNCER_TAG DATABASE_TAG PG_ARCHIVE_MODE

say() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# This server's settings (REGISTRY and its memory sizes), then the release being deployed.
dc() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/compose.yml" \
    --env-file "$LYTRO_HOME/settings.env" "$@"
}

container_of() { dc ps -q "$1"; }

# Waits until a service's container reports healthy, or fails after the limit.
wait_healthy() {
  local service="$1" limit="${2:-180}" waited=0 id status
  id="$(container_of "$service")"
  while :; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
    case "$status" in
      # `running` is what a container without a health check (the edge) reports once started.
      healthy | running) return 0 ;;
      unhealthy | exited | dead)
        say "$service is $status"
        docker logs --tail 50 "$id" || true
        return 1
        ;;
    esac
    if [ "$waited" -ge "$limit" ]; then
      say "$service not healthy after ${limit}s ($status)"
      docker logs --tail 50 "$id" || true
      return 1
    fi
    sleep 3
    waited=$((waited + 3))
  done
}

# What an API or worker process says it runs, from its own /health (D9-11).
release_of() {
  docker exec "$(container_of "$1")" node -e \
    "fetch('http://127.0.0.1:3000/health').then((r) => r.json()).then((b) => process.stdout.write(b.data.version + ' ' + b.data.role))"
}

# D9-12, D9-21 (Slice 9.2): the process's ready check answers 200, its database reached as the primary, before the next
# process is touched.
wait_ready() {
  local service="$1" waited=0
  until docker exec "$(container_of "$service")" node -e \
    "fetch('http://127.0.0.1:3000/health/ready').then((r) => process.exit(r.status === 200 ? 0 : 1), () => process.exit(1))"; do
    if [ "$waited" -ge 60 ]; then
      say "$service not ready after 60s"
      return 1
    fi
    sleep 3
    waited=$((waited + 3))
  done
}

roll_server() {
  local service="$1" role="$2" answer
  say "replacing $service"
  dc up -d --no-deps "$service"
  wait_healthy "$service"
  answer="$(release_of "$service")"
  if [ "$answer" != "$RELEASE $role" ]; then
    say "$service answers '$answer', expected '$RELEASE $role'"
    return 1
  fi
  wait_ready "$service"
  say "$service on $RELEASE, ready"
}

say "release $RELEASE, edge $EDGE_TAG, pooler $PGBOUNCER_TAG, database $DATABASE_TAG, archive $PG_ARCHIVE_MODE"

if [ -n "${LYTRO_SKIP_PULL:-}" ]; then
  say '1. using the images on this machine'
else
  say '1. pulling images'
  dc pull --quiet edge pgbouncer postgres backup api-1 worker website storefront
  dc --profile tools pull --quiet migrate static
fi

say '2. database, Redis and the pooler'
# The database's first-start scripts, copied where no deploy deletes them and the mount never moves (compose.yml), before
# PostgreSQL starts, so an empty volume's first start finds them.
init_dir="$LYTRO_HOME/state/postgres-init"
install -d -m 755 "$init_dir"
rm -f "$init_dir"/*.sh
install -m 755 "$DEPLOY_DIR"/postgres/*.sh "$init_dir/"
database_before="$(container_of postgres)"
dc up -d --wait postgres redis pgbouncer
# PgBouncer looks the database's name up itself, through a resolver that keeps its own answers (c-ares). While a replaced
# container was gone the name had no address, and PgBouncer went on failing "DNS lookup failed" long after the new one
# answered, so neither API process could reach the database (staging, 2026-11-13). A new database means a fresh pooler.
if [ -n "$database_before" ] && [ "$(container_of postgres)" != "$database_before" ]; then
  say 'the database was replaced: restarting the pooler'
  dc restart pgbouncer
  wait_healthy pgbouncer 60
fi

say '3. dumping the database'
mkdir -p "$LYTRO_HOME/backups/pre-deploy"
dump="$LYTRO_HOME/backups/pre-deploy/$(date -u +%Y%m%dT%H%M%SZ)-$RELEASE.dump"
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$dump.partial"
mv "$dump.partial" "$dump"
say "dump: $dump ($(du -h "$dump" | cut -f1))"
ls -1t "$LYTRO_HOME"/backups/pre-deploy/*.dump | tail -n +$((KEEP_DUMPS + 1)) | xargs -r rm -f

say '4. roles and migrations'
# The roles the server connects as, made if missing (deploy/postgres/10-app-role.sh): a database made before a release
# that added one (the read role, Slice 9.2) gets it here, as an empty one gets it when it first starts.
dc exec -T postgres sh /docker-entrypoint-initdb.d/10-app-role.sh
dc --profile tools run --rm migrate
# The nightly backups (Slice 9.3): replaced when its image changed, waiting for 05:30 Dhaka otherwise.
dc up -d --no-deps backup

say '5. the worker and the API'
roll_server worker worker
roll_server api-1 api
roll_server api-2 api

# Before the website and the storefront: they reach the API through the edge's internal listener (deploy/Caddyfile).
say "6. the dashboard's and console's files, then the edge"
dc --profile tools run --rm static
dc up -d --no-deps edge
wait_healthy edge 60

say '7. the website and the storefront'
dc up -d --no-deps website storefront
wait_healthy website
wait_healthy storefront

# What this server runs now, for anyone running `docker compose` here by hand (deploy/README.md).
printf 'RELEASE=%s\nEDGE_TAG=%s\nPGBOUNCER_TAG=%s\nDATABASE_TAG=%s\n' "$RELEASE" "$EDGE_TAG" "$PGBOUNCER_TAG" \
  "$DATABASE_TAG" > "$LYTRO_HOME/state/release.env.next"
mv "$LYTRO_HOME/state/release.env.next" "$LYTRO_HOME/state/release.env"
ln -sfn "$DEPLOY_DIR" "$LYTRO_HOME/state/current.next"
mv -fT "$LYTRO_HOME/state/current.next" "$LYTRO_HOME/state/current"

# Old release folders, and images no container has used for a week (a rollback past that pulls again).
ls -1dt "$LYTRO_HOME"/releases/*/ 2> /dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf || true
docker image prune --all --force --filter 'until=168h' > /dev/null

say "done: $RELEASE is live"

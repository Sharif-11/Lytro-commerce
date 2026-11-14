#!/usr/bin/env bash
# Puts a server armed by arm.sh back as its release runs it (Phase 9 Slice 9.10): the API and the worker restarted with
# the release's compose file alone, so every outside service is real again, the stand-in stopped and removed, and RTE-06's
# per-visitor setting put back if --ceiling raised it. The seeded shops stay: on the production server the wipe before
# launch removes them (deploy/load/README.md). Run as root.
#
#   sudo bash /opt/lytro/state/current/load/run/disarm.sh
set -euo pipefail

LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
DEPLOY_DIR="$(readlink -f "$LYTRO_HOME/state/current")"
export LYTRO_HOME
set -a
# shellcheck source=/dev/null
. "$LYTRO_HOME/state/release.env"
set +a

say() { printf '[disarm %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
release() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/compose.yml" --env-file "$LYTRO_HOME/settings.env" "$@"
}
loaded() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/compose.yml" -f "$DEPLOY_DIR/load/compose.load.yml" \
    --env-file "$LYTRO_HOME/settings.env" "$@"
}

state="$LYTRO_HOME/state/load-visitor-limit.json"
if [ -e "$state" ]; then
  before="$(cat "$state")"
  sql="UPDATE control.platform_settings SET value = '$before'::jsonb, updated_at = now() WHERE key = 'public_requests_per_visitor_per_minute';"
  printf '%s\n' "$sql" | release exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  rm -f "$state"
  say "public_requests_per_visitor_per_minute back to $before"
fi

say "removing the load test's operator account"
release exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DEPLOY_DIR/load/sql/remove-operator.sql"

say 'restarting the API and the worker as the release runs them'
release up -d --no-deps --wait api-1 api-2 worker
loaded rm --stop --force outside
say 'disarmed: the outside services are real again'

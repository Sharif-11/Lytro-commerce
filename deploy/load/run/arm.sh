#!/usr/bin/env bash
# Arms this server for a load test (Phase 9 Slice 9.10; deploy/load/README.md). Run as root on the server under test,
# from the release that is live: it builds the outside services' stand-in, starts it, and restarts the API and the
# worker with deploy/load/compose.load.yml over the release's compose file. Nothing else is touched. disarm.sh, or the
# next deploy, puts the server back.
#
#   sudo bash /opt/lytro/state/current/load/run/arm.sh [--ceiling]
#
# --ceiling also raises public_requests_per_visitor_per_minute (RTE-06's 120, a platform setting), which the ramp past
# twice the peak meets from one load machine; disarm.sh puts the setting back. Nothing here prints a secret.
set -euo pipefail

LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
DEPLOY_DIR="$(readlink -f "$LYTRO_HOME/state/current")"
export LYTRO_HOME
set -a
# shellcheck source=/dev/null
. "$LYTRO_HOME/state/release.env"
set +a

say() { printf '[arm %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
dc() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/compose.yml" -f "$DEPLOY_DIR/load/compose.load.yml" \
    --env-file "$LYTRO_HOME/settings.env" "$@"
}
psql_owner() { dc exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"; }

say "release $RELEASE: building and starting the outside services' stand-in"
dc build --quiet outside
dc up -d --wait outside

say 'restarting the API and the worker against it, with the load limits'
dc up -d --no-deps --wait api-1 api-2 worker

if [ "${1:-}" = --ceiling ]; then
  state="$LYTRO_HOME/state/load-visitor-limit.json"
  if [ ! -e "$state" ]; then
    psql_owner -Atc "SELECT value::text FROM control.platform_settings WHERE key = 'public_requests_per_visitor_per_minute'" > "$state"
  fi
  # Its row is migration 0070's, on every server.
  psql_owner -c "UPDATE control.platform_settings SET value = '100000'::jsonb, updated_at = now() WHERE key = 'public_requests_per_visitor_per_minute'"
  say 'raised public_requests_per_visitor_per_minute to 100000 for the ceiling run (was '"$(cat "$state")"')'
fi

say 'armed: every outside service now answers from the stand-in'

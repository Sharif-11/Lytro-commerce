#!/usr/bin/env bash
# Puts a server armed by arm.sh back as its release runs it (Phase 9 Slice 9.10): the stand-in removed and RTE-06's
# per-visitor setting put back if --ceiling raised it (stand-down.sh), the load test's operator removed, then the API and
# the worker restarted with the release's compose file alone, so every outside service is real again. The seeded shops
# stay: on the production server the wipe before launch removes them (deploy/load/README.md). Run as root.
#
#   sudo bash /opt/lytro/state/current/load/run/disarm.sh [--force]
#
# D9-34: it refuses while a load run is still going -- a run's guard checked in at the stand-in within the last 30
# seconds (k6/lib/guard.js) -- since the real providers would come back under it: stop the run first (on the load
# machine, `docker ps --filter ancestor=grafana/k6:1.0.0` lists what still runs). --force disarms anyway; the run then
# stops itself once the stand-in is gone, which stand-down.sh waits for before the API is touched.
set -euo pipefail

LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
DEPLOY_DIR="$(readlink -f "$LYTRO_HOME/state/current")"
# The stand-in's plain listener, published on this machine's loopback by compose.load.yml.
OUTSIDE_LOCAL="${OUTSIDE_LOCAL:-http://127.0.0.1:18081}"
export LYTRO_HOME
set -a
# shellcheck source=/dev/null
. "$LYTRO_HOME/state/release.env"
set +a

say() { printf '[disarm %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
release() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/compose.yml" --env-file "$LYTRO_HOME/settings.env" "$@"
}

if [ "${1:-}" != --force ]; then
  going="$(curl -fsS --max-time 5 "$OUTSIDE_LOCAL/load" 2> /dev/null || true)"
  case "$going" in
    *'"running":true'*)
      ago="$(printf '%s' "$going" | sed -n 's/.*"secondsAgo":\([0-9]*\).*/\1/p')"
      say "a load run checked in ${ago:-a few} s ago and is still going: stop it first" \
        '(on the load machine: docker ps --filter ancestor=grafana/k6:1.0.0), or disarm.sh --force'
      exit 1
      ;;
  esac
fi

bash "$DEPLOY_DIR/load/run/stand-down.sh"

say "removing the load test's operator account"
release exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DEPLOY_DIR/load/sql/remove-operator.sql"

say 'restarting the API and the worker as the release runs them'
release up -d --no-deps --wait api-1 api-2 worker
say 'disarmed: the outside services are real again'

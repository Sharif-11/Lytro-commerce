#!/usr/bin/env bash
# Whether this server is armed for load (Phase 9 Slice 9.10, D9-34): its outside services' stand-in running and
# answering, and the API's and the worker's every provider pointed at it, as deploy/load/compose.load.yml points them.
# Exits 0 only then; otherwise says what isn't, and exits 1. run.sh asks before a run and all through it, seed.sh and
# flash.sh before they start: no load reaches a server whose SMS, couriers, bKash, email or AI are the real ones.
# Nothing here prints a setting's value. Run as root.
#
#   sudo bash /opt/lytro/state/current/load/run/armed.sh
set -euo pipefail

LOAD_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# The stand-in's plain listener, published on this machine's loopback by compose.load.yml.
OUTSIDE_LOCAL="${OUTSIDE_LOCAL:-http://127.0.0.1:18081}"

say() { printf '[armed %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
not_armed() {
  say "not armed: $*"
  exit 1
}
# A running container of this server's deployment (compose.yml's project, lytro), by its service's name.
running() { docker ps -q --filter label=com.docker.compose.project=lytro --filter "label=com.docker.compose.service=$1"; }

# Every provider address compose.load.yml points at the stand-in: its one list of them.
providers="$(sed -n 's/^  \([A-Z][A-Z0-9_]*\): https:\/\/outside:8443\/.*/\1/p' "$LOAD_DIR/compose.load.yml")"
[ -n "$providers" ] || not_armed "no provider addresses in $LOAD_DIR/compose.load.yml"

[ -n "$(running outside)" ] || not_armed "the outside services' stand-in isn't running (arm.sh)"
curl -fsS --max-time 5 -o /dev/null "$OUTSIDE_LOCAL/health" ||
  not_armed "the stand-in doesn't answer at $OUTSIDE_LOCAL"

for service in api-1 api-2 worker; do
  id="$(running "$service")"
  [ -n "$id" ] || not_armed "$service isn't running"
  # Its settings go straight to grep, never to the screen: the real ones hold keys.
  settings="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$id")"
  for name in $providers; do
    printf '%s\n' "$settings" | grep -q "^$name=https://outside:8443/" ||
      not_armed "$service's $name isn't the stand-in: disarm.sh or a deploy has put the real provider back"
  done
done

say 'armed: every outside service answers from the stand-in'

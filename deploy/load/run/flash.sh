#!/usr/bin/env bash
# The flash sale (Phase 9 Slice 9.10; deploy/load/README.md, k6/spike.js MODE=flash), run on the armed server itself, as
# seed.sh is: k6 inside the server's network goes through the internal edge (http://edge:8080), so each order names a
# shopper of its own and RTE-06's ten a minute per shopper counts shoppers, not this machine. Light: ORDERS a second.
# Run as root, after seed.sh (its roster stays in the working folder):
#
#   sudo STOCK=300 ORDERS=10 HOLD_MINUTES=3 bash /opt/lytro/state/current/load/run/flash.sh
#
# SPIKE_SHOP and SPIKE_PRODUCT pick the product (indexes into the roster, 0). The results go to the working folder's
# out/, as flash-<time>-k6.*. Nothing here prints a secret.
set -euo pipefail

LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
DEPLOY_DIR="$(readlink -f "$LYTRO_HOME/state/current")"
WORK="${LOAD_WORK:-$LYTRO_HOME/state/load}"
K6_IMAGE="${K6_IMAGE:-grafana/k6:1.0.0}"
set -a
# shellcheck source=/dev/null
. "$LYTRO_HOME/state/release.env"
set +a

say() { printf '[flash %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
dc() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/compose.yml" -f "$DEPLOY_DIR/load/compose.load.yml" \
    --env-file "$LYTRO_HOME/settings.env" "$@"
}
setting() { sed -n "s/^$1=//p" "$LYTRO_HOME/env/server.env" | head -n 1; }

[ -f "$WORK/out/roster.json" ] || { say "no roster in $WORK/out: seed.sh first"; exit 1; }
network="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$(dc ps -q api-1)" | tr ' ' '\n' | grep internal | head -n 1)"
export EDGE_SECRET DOMAIN STOCK ORDERS HOLD_MINUTES SPIKE_SHOP SPIKE_PRODUCT
EDGE_SECRET="$(setting TRUSTED_EDGE_SECRET)"
DOMAIN="$(setting PLATFORM_DOMAIN)"
NAME="flash-$(date -u +%Y%m%dT%H%M%SZ)"

say "$NAME: ${ORDERS:-10} orders a second on one product holding ${STOCK:-300}"
# The secret goes by name from this shell, never on a command line. As root, to write into the root-owned folder.
docker run --rm --user 0:0 --network "$network" -v "$DEPLOY_DIR/load/k6:/scripts:ro" -v "$WORK/out:/out" -w /scripts \
  -e EDGE=http://edge:8080 -e EDGE_SECRET -e DOMAIN -e MODE=flash -e ROSTER_IN=/out/roster.json \
  -e STOCK -e ORDERS -e HOLD_MINUTES -e SPIKE_SHOP -e SPIKE_PRODUCT -e SUMMARY="/out/$NAME-k6.json" \
  "$K6_IMAGE" run spike.js | tee "$WORK/out/$NAME-k6.txt"
say "done: $WORK/out/$NAME-k6.*"

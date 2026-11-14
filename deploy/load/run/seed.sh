#!/usr/bin/env bash
# Fills an armed server (arm.sh) with the load test's shops (Phase 9 Slice 9.10; deploy/load/README.md): 100 shops signed
# up through phone codes, 50 of them with a year of the capacity model's data (300 products, 1,000 customers, 3,600
# orders each), the rest small. k6 runs on this server, inside its network, and goes through the internal edge
# (http://edge:8080) so each made-up person has a visitor address of their own; the SQL steps run as the database's
# owner. It takes about an hour and a half. Run as root:
#
#   sudo RUN=lt bash /opt/lytro/state/current/load/run/seed.sh
#
# RUN names the seeding (each shop's address starts with it). SHOPS, FULL_SHOPS, FULL_PRODUCTS, SMALL_PRODUCTS,
# FULL_ORDERS, SMALL_ORDERS and CUSTOMERS make it smaller (a shakedown). The roster it writes, out/roster.json in the
# working folder below, is what the load machine needs: copy it there. Nothing here prints a secret.
set -euo pipefail

LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
DEPLOY_DIR="$(readlink -f "$LYTRO_HOME/state/current")"
WORK="${LOAD_WORK:-$LYTRO_HOME/state/load}"
K6_IMAGE="${K6_IMAGE:-grafana/k6:1.0.0}"
export RUN="${RUN:-lt}"
export LYTRO_HOME
set -a
# shellcheck source=/dev/null
. "$LYTRO_HOME/state/release.env"
set +a

say() { printf '[seed %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
dc() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/compose.yml" -f "$DEPLOY_DIR/load/compose.load.yml" \
    --env-file "$LYTRO_HOME/settings.env" "$@"
}
setting() { sed -n "s/^$1=//p" "$LYTRO_HOME/env/server.env" | head -n 1; }
sql() { dc exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v prefix="$1"' psql "$RUN" < "$1"; }

[ "$(dc ps -q outside)" != '' ] || { say 'the stand-in is not running: arm.sh first'; exit 1; }
network="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$(dc ps -q api-1)" | tr ' ' '\n' | grep internal | head -n 1)"
# Readable by the deploy group, which the load machine copies the roster as. Its sessions are the test shops' only.
umask 027
install -d -m 750 -o root -g deploy "$WORK" "$WORK/out"
export EDGE_SECRET DOMAIN
EDGE_SECRET="$(setting TRUSTED_EDGE_SECRET)"
DOMAIN="$(setting PLATFORM_DOMAIN)"

k6() {
  # The secret goes by name from this shell, never on a command line.
  # As root, to write the roster into its root-owned folder (the image runs as a user of its own).
  docker run --rm --user 0:0 --network "$network" -v "$DEPLOY_DIR/load/k6:/scripts:ro" -v "$WORK/out:/out" -w /scripts \
    -e EDGE=http://edge:8080 -e EDGE_SECRET -e DOMAIN -e OUTSIDE=http://outside:8081 -e RUN -e ROSTER -e ROSTER_IN \
    -e OPERATOR_EMAIL -e OPERATOR_PASSWORD \
    -e SHOPS -e FULL_SHOPS -e FULL_PRODUCTS -e SMALL_PRODUCTS -e FULL_ORDERS -e SMALL_ORDERS -e CUSTOMERS -e VUS \
    "$K6_IMAGE" run --quiet "$@"
}

say "1. signing up the shops ($RUN)"
ROSTER=/out/shops.json k6 seed-shops.js
say '2. making them paying shops with room for a year'
sql "$DEPLOY_DIR/load/sql/seed-limits.sql"
say "2b. the load test's operator, who reads reports during the run (DAT-18); disarm.sh removes it"
export OPERATOR_EMAIL="load-test-$RUN@$DOMAIN" OPERATOR_PASSWORD
# Twenty characters: the most a password may have (PASSWORD_MAX_LENGTH).
OPERATOR_PASSWORD="$(openssl rand -hex 10)"
dc --profile tools run --rm --no-deps -T migrate \
  node node_modules/@lytronix/db/dist/create-operator.js "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" > /dev/null
say '3. their catalogues, website keys, bKash numbers and paired phones'
ROSTER_IN=/out/shops.json ROSTER=/out/roster.json k6 seed-catalogue.js
say "4. a year of orders (the longest step)"
ROSTER_IN=/out/roster.json k6 seed-orders.js
say '5. spreading them over the year'
sql "$DEPLOY_DIR/load/sql/spread-year.sql"
say "done: the roster is $WORK/out/roster.json; copy it to the load machine"

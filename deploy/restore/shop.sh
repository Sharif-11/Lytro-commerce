#!/usr/bin/env bash
# One shop's missing rows back from the archive, on the server (Phase 9 Slice 9.3, DAT-26; RUNBOOKS.md "Restoring one
# shop"). Run as root from the release's own folder:
#
#   sudo bash /opt/lytro/state/current/restore/shop.sh --shop <id> --to <time> [--apply]
#
#   <time>   just before the loss, ISO 8601 with its zone: 2026-11-13T10:42:00+06:00
#
# Starts a scratch copy of the database as it was at <time> (lytro-restore-pitr, beside the live one on the compose
# network, from the archive with this server's own backup key), then brings back the shop's rows the live database is
# missing (lytro-restore-shop). Without --apply it's a dry run: it says what it would add and keeps nothing. The scratch
# copy is removed at the end either way. Passwords travel in a root-only file, never on a command line.
set -euo pipefail

LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
shop=
to=
apply=
while [ $# -gt 0 ]; do
  case "$1" in
    --shop) shop="${2:-}"; shift 2 ;;
    --to) to="${2:-}"; shift 2 ;;
    --apply) apply=--apply; shift ;;
    *)
      echo 'usage: shop.sh --shop <id> --to <ISO time with zone> [--apply]' >&2
      exit 64
      ;;
  esac
done
if [ -z "$shop" ] || [ -z "$to" ]; then
  echo 'usage: shop.sh --shop <id> --to <ISO time with zone> [--apply]' >&2
  exit 64
fi
[ "$(id -u)" = 0 ] || { echo 'run as root (sudo)' >&2; exit 1; }

set -a
. "$LYTRO_HOME/settings.env"
. "$LYTRO_HOME/state/release.env"
set +a
image="$REGISTRY/lytro-database:${DATABASE_TAG:?release.env has no DATABASE_TAG: deploy a release with Slice 9.3 first}"
network=lytro_internal
setting() { sed -n "s/^$2=//p" "$LYTRO_HOME/env/$1" | head -n 1; }
user="$(setting postgres.env POSTGRES_USER)"
database="$(setting postgres.env POSTGRES_DB)"

work="$(mktemp -d)"
chmod 700 "$work"
cleanup() {
  docker rm -f lytro-restore-source > /dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "a copy of the database at $to, from the archive (this takes a few minutes)"
docker rm -f lytro-restore-source > /dev/null 2>&1 || true
docker run -d --name lytro-restore-source --network "$network" --memory 768m \
  --env-file "$LYTRO_HOME/env/backup.env" --env-file "$LYTRO_HOME/env/postgres.env" \
  -e RESTORE_DB_NAME="$database" "$image" lytro-restore-pitr --to "$to" --serve > /dev/null
source_url=
for _ in $(seq 1 1800); do
  logs="$(docker logs lytro-restore-source 2>&1 || true)"
  source_url="$(printf '%s\n' "$logs" | grep -o 'postgres://[^ ]*' | tail -n 1 || true)"
  [ -n "$source_url" ] && break
  if [ "$(docker inspect -f '{{.State.Running}}' lytro-restore-source 2> /dev/null)" != true ]; then
    printf '%s\n' "$logs" | grep -v '^INFO' | tail -n 30 >&2
    echo 'the copy did not come up' >&2
    exit 1
  fi
  sleep 2
done
[ -n "$source_url" ] || { echo 'the copy did not come up in an hour' >&2; exit 1; }
docker logs lytro-restore-source 2>&1 | grep -E '^- ' || true

# The copy's address by its container name; the live database as its owner, on the same network.
{
  printf 'RESTORE_FROM_URL=%s\n' "$(printf '%s' "$source_url" | sed -E 's#@[^:/]+:5432#@lytro-restore-source:5432#')"
  printf 'RESTORE_INTO_URL=postgres://%s:%s@postgres:5432/%s\n' "$user" "$(setting postgres.env POSTGRES_PASSWORD)" \
    "$database"
} > "$work/urls.env"
docker run --rm --network "$network" --env-file "$work/urls.env" "$image" lytro-restore-shop --shop "$shop" $apply

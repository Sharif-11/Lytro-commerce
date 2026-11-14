#!/usr/bin/env bash
# For CI's `backups` job, after start.sh (2026-11-14): deploy.sh's archive check, lytro-archive-check, passes on the
# primary that archives to the test store, and fails on one whose archive key is wrong, as staging's was. The error code
# deploy.sh reads from the database's log is found in WAL-G's real output, and nothing else is printed.
set -euo pipefail

DIR="${BACKUP_TEST_DIR:-/tmp/lytro-backups}"
IMAGE="${BACKUP_TEST_IMAGE:-lytro-database:ci}"
NET=backups-net
DENIED=pg-archive-denied
# The same filter as deploy.sh's.
CODES='\b(AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch|NoSuchBucket|RequestTimeTooSkewed|ExpiredToken)\b|status code: [0-9]{3}'

echo '== the working archive'
docker exec pg-backups lytro-archive-check

echo '== an archive key that can not write'
sed 's/^BACKUP_PITR_KEY_SECRET=.*/BACKUP_PITR_KEY_SECRET=not-the-secret/' "$DIR/test.env" > "$DIR/denied.env"
ready() {
  for _ in $(seq 1 90); do
    if docker exec "$1" pg_isready -U postgres -h 127.0.0.1 -q 2> /dev/null &&
      [ "$(docker exec "$1" psql -U postgres -h 127.0.0.1 -Atc 'SHOW archive_mode' 2> /dev/null)" = "$2" ]; then
      return 0
    fi
    sleep 1
  done
  echo "$1 never started" >&2
  docker logs "$1" 2>&1 | tail -20 >&2
  return 1
}
# Its data made first with archiving off, as a server's already is: a new database's first start stops a temporary
# server, and with every archive attempt failing that stop never finishes.
docker rm -f "$DENIED" "$DENIED-first" > /dev/null 2>&1 || true
docker volume rm "$DENIED-data" > /dev/null 2>&1 || true
docker run -d --name "$DENIED-first" -v "$DENIED-data:/var/lib/postgresql/data" --env-file "$DIR/denied.env" \
  "$IMAGE" > /dev/null
ready "$DENIED-first" off
docker rm -f "$DENIED-first" > /dev/null
docker run -d --name "$DENIED" --network "$NET" -v "$DENIED-data:/var/lib/postgresql/data" \
  --env-file "$DIR/denied.env" "$IMAGE" \
  postgres -c archive_mode=on -c 'archive_command=lytro-archive %p' -c archive_timeout=60 > /dev/null
ready "$DENIED" on
if docker exec -e LYTRO_ARCHIVE_CHECK_SECONDS=90 "$DENIED" lytro-archive-check; then
  echo 'the check passed an archive that can not be written' >&2
  exit 1
fi
codes="$(docker logs "$DENIED" 2>&1 | grep -oE "$CODES" | sort -u | tr '\n' ' ' || true)"
docker rm -f "$DENIED" > /dev/null
docker volume rm "$DENIED-data" > /dev/null
rm -f "$DIR/denied.env"
if [ -z "$codes" ]; then
  echo "deploy.sh's filter found no error code in WAL-G's output" >&2
  exit 1
fi
echo "deploy.sh would name: $codes"

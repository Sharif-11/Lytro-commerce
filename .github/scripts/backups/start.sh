#!/usr/bin/env bash
# For apps/server/test/backups.e2e.spec.ts and failover.sh (Phase 9 Slice 9.3, CI's `backups` job): the database image
# built as lytro-database:ci, a test S3 store standing in for R2 (Versity's gateway over plain folders: a bucket is a
# folder), throwaway keys, and a primary on localhost:5443 sending its write-ahead log to the store, as a server does.
# Everything the spec needs is in $BACKUP_TEST_DIR: test.env (the backup settings, as backup.env holds them on a
# server) and age.key (the owner's identity, which on a server never exists).
set -euo pipefail

# pwd -W: the same folder as Docker on Windows names it (a developer's machine); plain pwd on Linux.
ROOT="$(cd "$(dirname "$0")/../../.." && (pwd -W 2> /dev/null || pwd))"
DIR="${BACKUP_TEST_DIR:-/tmp/lytro-backups}"
IMAGE="${BACKUP_TEST_IMAGE:-lytro-database:ci}"
NET=backups-net
PASSWORD=ci_only_password
mkdir -p "$DIR"

docker build -q -f "$ROOT/deploy/database/Dockerfile" -t "$IMAGE" "$ROOT" > /dev/null
docker network create "$NET" > /dev/null

# The store: two buckets, one key for both (on a server each bucket has its own).
docker run -d --name backups-s3 --network "$NET" -v backups-s3data:/data \
  -e ROOT_ACCESS_KEY=ci-backups -e ROOT_SECRET_KEY=ci-backups-secret -e VGW_BACKEND=posix -e VGW_BACKEND_ARG=/data \
  versity/versitygw:v1.11.0 > /dev/null
docker exec backups-s3 mkdir -p /data/pitr /data/dumps

docker run --rm --entrypoint age-keygen "$IMAGE" > "$DIR/age.key" 2> "$DIR/age.pub.txt"
chmod 644 "$DIR/age.key"
cat > "$DIR/test.env" << EOF
BACKUP_R2_ENDPOINT=http://backups-s3:7070
BACKUP_S3_REGION=us-east-1
BACKUP_PITR_BUCKET=pitr
BACKUP_PITR_KEY_ID=ci-backups
BACKUP_PITR_KEY_SECRET=ci-backups-secret
BACKUP_PITR_ENCRYPTION_KEY=$(openssl rand -hex 32)
BACKUP_DUMP_BUCKET=dumps
BACKUP_DUMP_KEY_ID=ci-backups
BACKUP_DUMP_KEY_SECRET=ci-backups-secret
BACKUP_DUMP_RECIPIENT=$(grep -o 'age1[0-9a-z]*' "$DIR/age.pub.txt")
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$PASSWORD
EOF

docker run -d --name pg-backups --network "$NET" -p 5443:5432 --env-file "$DIR/test.env" \
  -v pgdata-backups:/var/lib/postgresql/data "$IMAGE" \
  postgres -c archive_mode=on -c 'archive_command=lytro-archive %p' -c archive_timeout=60 > /dev/null

# Ready only once the image has run its first start and restarted for real.
for _ in $(seq 1 60); do
  if docker exec pg-backups pg_isready -U postgres -h 127.0.0.1 -q 2> /dev/null &&
    [ "$(docker exec pg-backups psql -U postgres -h 127.0.0.1 -Atc 'SHOW archive_mode' 2> /dev/null)" = on ]; then
    echo "the primary on 5443, archiving to the test store; settings in $DIR"
    exit 0
  fi
  sleep 1
done
echo 'the primary never started' >&2
docker logs pg-backups >&2 || true
exit 1

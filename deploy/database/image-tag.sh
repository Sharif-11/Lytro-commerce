#!/bin/sh
# Prints the database image's tag: a short hash of what goes into it (its Dockerfile and scripts). The same inputs give
# the same tag, so the deploy workflow builds it only when one changed, and deploy.sh computes the same tag from the
# release's own copy of deploy/ (Slice 9.3, as deploy/pgbouncer/image-tag.sh does for the pooler).
set -eu
cd "$(dirname "$0")/../.."
{
  cat deploy/database/Dockerfile
  for f in $(find deploy/database/bin -type f | LC_ALL=C sort); do
    printf '%s\n' "$f"
    cat "$f"
  done
} | tr -d '\r' | sha256sum | cut -c1-16

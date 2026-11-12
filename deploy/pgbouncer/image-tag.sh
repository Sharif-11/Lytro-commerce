#!/bin/sh
# Prints the pooler image's tag: a short hash of what goes into it (its Dockerfile and start script). The same inputs
# give the same tag, so the deploy workflow builds it only when one changed, and deploy.sh computes the same tag from the
# release's own copy of deploy/, so no one has to pass it (Slice 9.2).
set -eu
cd "$(dirname "$0")/../.."
cat deploy/pgbouncer/Dockerfile deploy/pgbouncer/entrypoint.sh | tr -d '\r' | sha256sum | cut -c1-16

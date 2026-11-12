#!/bin/sh
# Prints the edge image's tag: a short hash of everything that goes into it (its Dockerfile and the Caddyfile). The same
# inputs give the same tag, so the deploy workflow builds the edge only when one of them changed, and a deploy replaces
# Caddy (dropping its open connections for a moment) only then (Slice 9.1).
set -eu
cd "$(dirname "$0")/../.."
cat deploy/caddy/Dockerfile deploy/Caddyfile | tr -d '\r' | sha256sum | cut -c1-16

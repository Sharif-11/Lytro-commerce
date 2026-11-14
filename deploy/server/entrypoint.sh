#!/bin/sh
# SEC-10, D9-8 (Phase 9 Slice 9.7): how the server's image starts. The sealing key reaches the container as a file only
# root can read (compose's `data_encryption_key` secret, from /opt/lytro/env/data-encryption.key, root:root 600): read
# here, as root, into the server's environment; then the server runs as `node`, which can't read the file. Its first
# line is the key; a second, only while the key is being changed (RUNBOOKS.md §3), the one before it. Without the file
# (development, the migrations) the environment's own settings are used.
set -eu

KEY_FILE=/run/secrets/data_encryption_key
if [ -f "$KEY_FILE" ]; then
  DATA_ENCRYPTION_KEY="$(sed -n 1p "$KEY_FILE")"
  export DATA_ENCRYPTION_KEY
  previous="$(sed -n 2p "$KEY_FILE")"
  if [ -n "$previous" ]; then
    DATA_ENCRYPTION_PREVIOUS_KEY="$previous"
    export DATA_ENCRYPTION_PREVIOUS_KEY
  fi
fi

if [ "$(id -u)" = 0 ]; then
  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi
exec "$@"

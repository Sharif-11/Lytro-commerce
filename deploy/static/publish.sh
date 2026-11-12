#!/bin/sh
# Publishes one release's dashboard and console files into the edge's volume (Slice 9.1, D9-10), then switches the
# `current` link to them in one step, so Caddy serves either the old release or the new one, never a mix. Runs from the
# `static` image (Dockerfile) as deploy/compose.yml's one-off `static` step; safe to run twice.
#
#   /release            this image's files: dashboard/ and operator/
#   /srv/static         the volume Caddy reads (read-only there)
#     releases/<sha>/   one folder per release published
#     current -> releases/<sha>
#
# The release that was current before is kept, so a rollback (deploying the previous commit again) switches straight
# back; every other release is removed.
set -eu

RELEASE="${RELEASE:?the static image sets RELEASE}"
ROOT=/srv/static

mkdir -p "$ROOT/releases"
if [ ! -d "$ROOT/releases/$RELEASE" ]; then
  rm -rf "$ROOT/releases/.incoming"
  cp -R /release "$ROOT/releases/.incoming"
  mv -T "$ROOT/releases/.incoming" "$ROOT/releases/$RELEASE"
fi

previous=""
if [ -L "$ROOT/current" ]; then
  previous="$(readlink "$ROOT/current" | sed 's#^releases/##')"
fi

# A relative link, so it resolves the same inside Caddy's container, where the volume sits at the same path. `mv -T`
# renames the new link over the old one in one step; without -T it would move the link into the folder `current` names.
ln -sfn "releases/$RELEASE" "$ROOT/.current-next"
mv -fT "$ROOT/.current-next" "$ROOT/current"
echo "static: serving $RELEASE"

# A rerun of the same release changes nothing, so it keeps the one to roll back to.
if [ "$previous" = "$RELEASE" ]; then
  exit 0
fi
for old in $(ls -1 "$ROOT/releases"); do
  if [ "$old" != "$RELEASE" ] && [ "$old" != "$previous" ]; then
    rm -rf "${ROOT:?}/releases/$old"
    echo "static: removed $old"
  fi
done

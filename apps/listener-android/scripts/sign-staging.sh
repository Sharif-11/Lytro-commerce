#!/usr/bin/env bash
# Signs staging's listener APK, which CI builds unsigned (listener-android.yml keeps it as `listener-staging-unsigned`), with
# the staging key on this computer, and writes what the staging downloads bucket holds: the APK, its .sha256 and latest.json,
# named as `listenerStagingRelease` names them. Signing takes little memory; building the APK here takes a lot.
#
#   LYTRO_LISTENER_STAGING_KEY=<the key's .properties> \
#     apps/listener-android/scripts/sign-staging.sh <app-staging-unsigned.apk> <folder to write into>
set -euo pipefail

unsigned="${1:?Name the unsigned APK}"
out="${2:?Name a folder to write into}"
properties="${LYTRO_LISTENER_STAGING_KEY:?Set LYTRO_LISTENER_STAGING_KEY to the properties file of the staging key}"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$sdk" ]; then
  echo "Set ANDROID_HOME to the Android SDK" >&2
  exit 2
fi

prop() { grep -m1 "^$1=" "$properties" | cut -d= -f2-; }
tools="$(ls -d "$sdk"/build-tools/* | sort -V | tail -1)"
version="$(sed -n 's/^ *versionName = "\(.*\)"$/\1/p' "$(dirname "$0")/../app/build.gradle.kts" | head -1)-staging"
name="lytro-listener-$version.apk"
apk="$out/$name"
mkdir -p "$out"

# Gradle aligns the APK; one that isn't would not install on every phone.
"$tools/zipalign" -c -p 4 "$unsigned"

# The passwords go through the environment, never the command line or the screen.
STORE_PASS="$(prop storePassword)" KEY_PASS="$(prop keyPassword)" \
  java -Xmx256m -jar "$tools/lib/apksigner.jar" sign \
  --ks "$(prop storeFile)" --ks-key-alias "$(prop keyAlias)" \
  --ks-pass env:STORE_PASS --key-pass env:KEY_PASS \
  --out "$apk" "$unsigned"
rm -f "$apk.idsig"

echo "Signed by:"
java -Xmx256m -jar "$tools/lib/apksigner.jar" verify --print-certs "$apk" | grep -i "SHA-256 digest"

sha256="$(sha256sum "$apk" | cut -d' ' -f1)"
bytes="$(wc -c < "$apk" | tr -d ' ')"
echo "$sha256  $name" > "$apk.sha256"
printf '{"version":"%s","file":"%s","sha256":"%s","bytes":%s}\n' "$version" "$name" "$sha256" "$bytes" > "$out/latest.json"

echo "Staging $version: $apk"
echo "Upload to the staging downloads bucket: $name, then latest.json"

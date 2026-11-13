#!/usr/bin/env bash
# Makes Lytro Listener's release signing key, once, in a folder of your choosing outside this repo. Agreed 2026-11-03: the key stays
# on the owner's computer, with a backup, and nothing that signs a real release ever goes near GitHub.
#
# Lose this key and every shop has to reinstall the app, so back it up the moment it exists.
#
#   apps/listener-android/scripts/new-release-key.sh <folder outside the repo>
set -euo pipefail

folder="${1:-}"
if [ -z "$folder" ]; then
  echo "Say where to keep it: new-release-key.sh <folder outside this repo>" >&2
  exit 2
fi

keytool_bin="keytool"
if [ -n "${JAVA_HOME:-}" ]; then keytool_bin="$JAVA_HOME/bin/keytool"; fi

# Git Bash on Windows writes one folder two ways (/d/x and D:/x), so both sides go through the same `pwd`, and Git itself is asked too:
# this repo is public, so a key must never be able to land inside it.
repo="$(cd "$(cd "$(dirname "$0")" && git rev-parse --show-toplevel)" && pwd -P)"
# The nearest folder that exists. Git Bash sees D:/x's drive as "D:", which is never a folder and is its own dirname, so the
# walk goes through /d/x; and a walk that stops moving ends there rather than looping forever.
parent="$folder"
if command -v cygpath >/dev/null 2>&1; then parent="$(cygpath -u "$parent")"; fi
while [ ! -d "$parent" ]; do
  next="$(dirname "$parent")"
  if [ "$next" = "$parent" ]; then
    echo "Refusing: none of the folders above $folder exists." >&2
    exit 2
  fi
  parent="$next"
done
case "$(cd "$parent" && pwd -P)/" in
  "$repo"/*)
    echo "Refusing: $folder is inside this repo, and this repo is public." >&2
    exit 2
    ;;
esac
if git -C "$parent" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Refusing: $folder is inside a Git repo, where a key could be committed." >&2
  exit 2
fi

mkdir -p "$folder"
folder="$(cd "$folder" && pwd -P)"

key="$folder/lytro-listener-release.jks"
properties="$folder/lytro-listener-release.properties"
if [ -e "$key" ] || [ -e "$properties" ]; then
  echo "Refusing: a key already exists in $folder. Replacing it would make every shop reinstall the app." >&2
  exit 2
fi

password="${LISTENER_KEY_PASSWORD:-}"
if [ -z "$password" ]; then
  read -r -s -p "Choose a password for the key (keep it in your password manager): " password
  echo
  read -r -s -p "Once more: " again
  echo
  if [ "$password" != "$again" ]; then
    echo "The two did not match; nothing was made." >&2
    exit 2
  fi
fi
if [ "${#password}" -lt 12 ]; then
  echo "Use at least 12 characters; nothing was made." >&2
  exit 2
fi

KEY_PASSWORD="$password" "$keytool_bin" -genkeypair -noprompt \
  -keystore "$key" -storetype PKCS12 -storepass:env KEY_PASSWORD \
  -alias lytro-listener -keyalg RSA -keysize 4096 -validity 36500 \
  -dname "CN=Lytro Listener, O=Lytro, C=BD"

# Gradle runs on Java, which reads D:/x and not Git Bash's /d/x.
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

{
  echo "# Lytro Listener's release key. Never commit this, or the key beside it."
  echo "storeFile=$(native "$key")"
  echo "storePassword=$password"
  echo "keyAlias=lytro-listener"
  echo "keyPassword=$password"
  echo "# The support WhatsApp the app's Help opens, digits only, as the dashboard's. Left empty, those rows hide."
  echo "supportWhatsapp="
} > "$properties"
chmod 600 "$key" "$properties"

echo
echo "Made $key"
echo "Its fingerprint, for checking any APK later:"
KEY_PASSWORD="$password" "$keytool_bin" -list -keystore "$key" -storepass:env KEY_PASSWORD -alias lytro-listener | grep -i "SHA-256" || true
echo
echo "Do these now:"
echo "  1. Copy the .jks file to two places besides this computer, such as a USB drive and your private cloud drive."
echo "  2. Keep the password in your password manager, not beside those copies."
echo "  3. Set supportWhatsapp in $properties"
echo "  4. Release with: LYTRO_LISTENER_KEY=\"$(native "$properties")\" ./gradlew :app:listenerRelease"

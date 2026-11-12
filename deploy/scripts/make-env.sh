#!/usr/bin/env bash
# Writes a server's settings into /opt/lytro/env/*.env, once (Slice 9.1). Run as root on the server after
# setup-server.sh:
#
#   PLATFORM_DOMAIN=staging.lytro.app PLATFORM_ADDRESSES=<the server's IPv4> ACME_EMAIL=<an address Let's Encrypt
#   writes to> ROBOTS=robots_noindex bash make-env.sh
#
# It makes every secret Lytro makes itself (the edge secret, the storefront's, the sign-in codes', the sealing key, both
# database passwords, the push keys) and writes each where it belongs, the same value everywhere it must match. What
# only an outside service can give is left as a commented line to fill in (deploy/README.md lists them). It never
# overwrites a file that exists, so running it twice changes nothing; delete a file to make it again.
#
# Every file is root-owned and readable by the deploy group only (0640): Docker reads them for the containers, and no
# secret is ever in an image, the repository or a log (Phase 9 §3.6). Nothing here is printed.
set -euo pipefail

: "${PLATFORM_DOMAIN:?e.g. staging.lytro.app}"
: "${PLATFORM_ADDRESSES:?the public IPv4 address of this server}"
: "${ACME_EMAIL:?the address the certificate authority writes to}"
ROBOTS="${ROBOTS:-robots_allow}"
ENV_DIR="${LYTRO_HOME:-/opt/lytro}/env"

[ "$(id -u)" = 0 ] || { echo 'run as root' >&2; exit 1; }
umask 077
install -d -m 750 -o root -g deploy "$ENV_DIR"

secret() { openssl rand -hex "${1:-32}"; }
b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }

# Web push's VAPID key pair (WEB-PUSH, Slice 7.3): a P-256 key, written as web-push writes it -- the raw private scalar
# and the uncompressed public point, base64url. In the key's 121-byte DER form the scalar starts at byte 8 and the point
# at byte 57.
vapid() {
  local der
  der="$(mktemp)"
  openssl ecparam -name prime256v1 -genkey -noout | openssl ec -outform DER -out "$der" 2> /dev/null
  [ "$(stat -c %s "$der")" = 121 ] || { echo 'unexpected VAPID key form' >&2; exit 1; }
  VAPID_PRIVATE_KEY="$(tail -c +8 "$der" | head -c 32 | b64url)"
  VAPID_PUBLIC_KEY="$(tail -c +57 "$der" | head -c 65 | b64url)"
  rm -f "$der"
}

# Reuses a value already written (so the files agree after one of them is remade), or makes one.
existing() { [ -f "$ENV_DIR/$1" ] && sed -n "s/^$2=//p" "$ENV_DIR/$1" | head -1 || true; }
EDGE_SECRET="$(existing server.env TRUSTED_EDGE_SECRET)"
EDGE_SECRET="${EDGE_SECRET:-$(secret 32)}"
STOREFRONT_SECRET="$(existing server.env STOREFRONT_SECRET)"
STOREFRONT_SECRET="${STOREFRONT_SECRET:-$(secret 32)}"
OWNER_PASSWORD="$(existing postgres.env POSTGRES_PASSWORD)"
OWNER_PASSWORD="${OWNER_PASSWORD:-$(secret 24)}"
APP_PASSWORD="$(existing postgres.env LYTRO_APP_DB_PASSWORD)"
APP_PASSWORD="${APP_PASSWORD:-$(secret 24)}"

write() {
  local name="$1" file="$ENV_DIR/$1"
  if [ -e "$file" ]; then
    echo "kept $name"
    cat > /dev/null
    return
  fi
  cat > "$file"
  chown root:deploy "$file"
  chmod 640 "$file"
  echo "wrote $name"
}

write postgres.env <<EOF
POSTGRES_USER=lytronix
POSTGRES_PASSWORD=$OWNER_PASSWORD
POSTGRES_DB=lytronix
LYTRO_APP_DB_PASSWORD=$APP_PASSWORD
EOF

write migrate.env <<EOF
# The schema owner: migrations and pg-boss's schema (deploy/compose.yml's migrate step).
DATABASE_URL=postgres://lytronix:$OWNER_PASSWORD@postgres:5432/lytronix
EOF

vapid
write server.env <<EOF
NODE_ENV=production
PLATFORM_DOMAIN=$PLATFORM_DOMAIN
PLATFORM_ADDRESSES=$PLATFORM_ADDRESSES
DATABASE_URL=postgres://lytronix_app:$APP_PASSWORD@postgres:5432/lytronix
TRUSTED_EDGE_SECRET=$EDGE_SECRET
STOREFRONT_SECRET=$STOREFRONT_SECRET
OTP_SECRET=$(secret 32)
DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
OAUTH_CALLBACK_BASE=https://app.$PLATFORM_DOMAIN
CLIENT_IP_HEADER=x-forwarded-for
CLIENT_IP_FORMAT=list
TRUSTED_PROXY_HOPS=1
VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY
VAPID_SUBJECT=mailto:$ACME_EMAIL

# From outside services: fill these in, then remove the leading '#'. The server refuses to start in production without
# the first five (deploy/README.md says where each comes from).
# BULKSMSBD_API_KEY=
# BULKSMSBD_SENDER_ID=
# RESEND_API_KEY=
# RESEND_WEBHOOK_SECRET=
# GEMINI_API_KEY=
# MAIL_FROM=Lytro Staging <no-reply@mail.lytro.app>
# Media (R2), all together or none:
# MEDIA_STORAGE_ENDPOINT=
# MEDIA_STORAGE_REGION=auto
# MEDIA_UPLOADS_BUCKET=
# MEDIA_BUCKET=
# MEDIA_EVIDENCE_BUCKET=
# MEDIA_SIGNER_ACCESS_KEY=
# MEDIA_SIGNER_SECRET_KEY=
# MEDIA_PROCESSOR_ACCESS_KEY=
# MEDIA_PROCESSOR_SECRET_KEY=
# MEDIA_DELETER_ACCESS_KEY=
# MEDIA_DELETER_SECRET_KEY=
# MEDIA_PUBLIC_BASE_URL=
EOF

write website.env <<EOF
TRUSTED_EDGE_SECRET=$EDGE_SECRET
SITE_URL=https://$PLATFORM_DOMAIN
APP_URL=https://app.$PLATFORM_DOMAIN
# SUPPORT_EMAIL=
# LISTENER_DOWNLOAD_URL=
EOF

write storefront.env <<EOF
PLATFORM_DOMAIN=$PLATFORM_DOMAIN
TRUSTED_EDGE_SECRET=$EDGE_SECRET
STOREFRONT_SECRET=$STOREFRONT_SECRET
CLIENT_IP_HEADER=x-forwarded-for
EOF

write edge.env <<EOF
PLATFORM_DOMAIN=$PLATFORM_DOMAIN
ACME_EMAIL=$ACME_EMAIL
TRUSTED_EDGE_SECRET=$EDGE_SECRET
ROBOTS=$ROBOTS
# A Cloudflare API token that can only edit the lytro.app zone's DNS (deploy/README.md), never the server's media token.
# CLOUDFLARE_DNS_API_TOKEN=
# The same two addresses as the server's, for the dashboard's and console's Content Security Policy:
# MEDIA_PUBLIC_BASE_URL=
# MEDIA_STORAGE_ENDPOINT=
EOF

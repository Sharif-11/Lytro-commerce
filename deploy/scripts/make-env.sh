#!/usr/bin/env bash
# Writes a server's settings into /opt/lytro/env/*.env, once (Slice 9.1). Run as root on the server after
# setup-server.sh:
#
#   PLATFORM_DOMAIN=staging.lytro.app PLATFORM_ADDRESSES=<the server's IPv4> ACME_EMAIL=<the certificate
#   account's address> ROBOTS=robots_noindex bash make-env.sh
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
READ_PASSWORD="$(existing postgres.env LYTRO_READ_DB_PASSWORD)"
READ_PASSWORD="${READ_PASSWORD:-$(secret 24)}"
REDIS_PASSWORD="$(existing redis.env REDIS_PASSWORD)"
REDIS_PASSWORD="${REDIS_PASSWORD:-$(secret 24)}"

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

# A file kept from an earlier release's setup may lack a line this release adds (the read role's password, Slice 9.2):
# it is added, and nothing already in the file changes.
add_missing() {
  local name="$1" key="$2" value="$3" file="$ENV_DIR/$1"
  if [ -f "$file" ] && ! grep -q "^$key=" "$file"; then
    printf '%s=%s\n' "$key" "$value" >> "$file"
    echo "added $key to $name"
  fi
}

write postgres.env <<EOF
POSTGRES_USER=lytronix
POSTGRES_PASSWORD=$OWNER_PASSWORD
POSTGRES_DB=lytronix
LYTRO_APP_DB_PASSWORD=$APP_PASSWORD
LYTRO_READ_DB_PASSWORD=$READ_PASSWORD
EOF
add_missing postgres.env LYTRO_READ_DB_PASSWORD "$READ_PASSWORD"

write migrate.env <<EOF
# The schema owner: migrations and pg-boss's schema (deploy/compose.yml's migrate step).
DATABASE_URL=postgres://lytronix:$OWNER_PASSWORD@postgres:5432/lytronix
EOF

# The API's, over server.env (deploy/compose.yml's x-api): through PgBouncer, which sets the API's limits (DAT-23), as
# the application role for writes and the read-only role for the reads code marks (Slice 9.2, D9-13). The worker and
# the migrations keep the direct addresses.
write server-api.env <<EOF
DATABASE_URL=postgres://lytronix_app:$APP_PASSWORD@pgbouncer:6432/lytronix
DATABASE_READ_URL=postgres://lytronix_read:$READ_PASSWORD@pgbouncer:6432/lytronix
DATABASE_THROUGH_POOLER=true
EOF

# The pooler's: the two roles it logs in as (deploy/pgbouncer).
write pgbouncer.env <<EOF
PGBOUNCER_APP_PASSWORD=$APP_PASSWORD
PGBOUNCER_READ_PASSWORD=$READ_PASSWORD
EOF

# The shared Redis's password (Slice 9.4, RED-01); the server reaches it as REDIS_URL (server.env).
write redis.env <<EOF
REDIS_PASSWORD=$REDIS_PASSWORD
EOF

# The backups' (Slice 9.3, D9-18, DAT-28): only the database and backup containers read it, never the app's. The
# archive's encryption key is made here; the rest comes from Cloudflare and the owner (deploy/README.md "Backups").
# Archiving starts on the first deploy after the archive's lines are all filled in.
ARCHIVE_KEY="$(existing backup.env BACKUP_PITR_ENCRYPTION_KEY)"
ARCHIVE_KEY="${ARCHIVE_KEY:-$(secret 32)}"
write backup.env <<EOF
# Made by make-env.sh: the archive's encryption key. Keep the owner's offline copy: without it the archive can't be
# read, by anyone.
BACKUP_PITR_ENCRYPTION_KEY=$ARCHIVE_KEY

# From Cloudflare (deploy/README.md "Backups"): the account's R2 address, and each bucket with its own key.
BACKUP_R2_ENDPOINT=
# The archive, for restoring to a minute: locked 14 days.
BACKUP_PITR_BUCKET=
BACKUP_PITR_KEY_ID=
BACKUP_PITR_KEY_SECRET=
# The nightly dump: locked 29 days, then deleted, gone by day 30.
BACKUP_DUMP_BUCKET=
BACKUP_DUMP_KEY_ID=
BACKUP_DUMP_KEY_SECRET=

# The owner's age public key (age1...): dumps are encrypted to it. Its private key never comes to a server.
BACKUP_DUMP_RECIPIENT=
EOF
add_missing backup.env BACKUP_PITR_ENCRYPTION_KEY "$ARCHIVE_KEY"
add_missing backup.env BACKUP_DUMP_RECIPIENT ''

vapid
write server.env <<EOF
# The server's settings (deploy/README.md, step 4). Three groups: made here, required, and optional.

# Made by make-env.sh on this server: leave them as they are. Copy DATA_ENCRYPTION_KEY into a password manager.
NODE_ENV=production
PLATFORM_DOMAIN=$PLATFORM_DOMAIN
PLATFORM_ADDRESSES=$PLATFORM_ADDRESSES
DATABASE_URL=postgres://lytronix_app:$APP_PASSWORD@postgres:5432/lytronix
REDIS_URL=redis://:$REDIS_PASSWORD@redis:6379
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
# How a push service reaches Lytro about its pushes: the site, so the certificate account's address goes nowhere else.
VAPID_SUBJECT=https://$PLATFORM_DOMAIN

# Required: the server refuses to start in production until each is filled in.
BULKSMSBD_API_KEY=
BULKSMSBD_SENDER_ID=
RESEND_API_KEY=
# Resend's webhook for https://api.$PLATFORM_DOMAIN/v1/webhooks/email/resend (email.bounced, email.complained): whsec_...
RESEND_WEBHOOK_SECRET=
GEMINI_API_KEY=

# Optional: remove the '#' to turn one on.
# MAIL_FROM=Lytro <no-reply@mail.lytro.app>

# Google sign-in. Its redirect address in Google Cloud: https://app.$PLATFORM_DOMAIN/auth/oauth/google/callback
# GOOGLE_SIGN_IN_ENABLED=true
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

# Facebook sign-in. Its redirect address in Meta: https://app.$PLATFORM_DOMAIN/auth/oauth/facebook/callback
# FACEBOOK_SIGN_IN_ENABLED=true
# FACEBOOK_APP_ID=
# FACEBOOK_APP_SECRET=

# Couriers. Lytro's own RedX token reads RedX's area list; without it RedX can't book. Pathao's webhook answer only if
# its webhook page insists.
# REDX_AREAS_TOKEN=
# PATHAO_WEBHOOK_INTEGRATION_SECRET=

# Media (R2): all of these or none. Its uploads bucket must accept https://app.$PLATFORM_DOMAIN (CORS).
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

# Media's Cloudflare side (its costs and blocked list): all three or none. The media token, never the DNS one.
# CLOUDFLARE_ACCOUNT_ID=
# CLOUDFLARE_API_TOKEN=
# MEDIA_EDGE_KV_NAMESPACE_ID=

# Tuning: the built-in values are right; listed so nothing is hidden. Unset means the built-in value.
# DATABASE_POOL_MAX=5
# DATABASE_CONNECT_TIMEOUT_MS=5000
# DATABASE_STATEMENT_TIMEOUT_MS=10000
# SIGNUP_RATE_LIMIT_PER_IP=
# CODE_SMS_PER_IP_PER_HOUR=
# TRIAL_LIMIT_PER_IDENTITY=
# TRIAL_LIMIT_PER_IP=
# TRIAL_LIMIT_WINDOW_DAYS=

# Only while changing a key (RUNBOOKS): the old sealing key, and the edge secret coming in.
# DATA_ENCRYPTION_PREVIOUS_KEY=
# TRUSTED_EDGE_SECRET_NEXT=
EOF
add_missing server.env REDIS_URL "redis://:$REDIS_PASSWORD@redis:6379"

write website.env <<EOF
# Made by make-env.sh: leave them as they are.
TRUSTED_EDGE_SECRET=$EDGE_SECRET
SITE_URL=https://$PLATFORM_DOMAIN
APP_URL=https://app.$PLATFORM_DOMAIN

# Optional: remove the '#' to turn one on.
# The address the contact page shows.
# SUPPORT_EMAIL=
# Where the payment listener app downloads from (built-in: https://download.lytro.app).
# LISTENER_DOWNLOAD_URL=
# Where the contact form sends each message.
# CONTACT_WEBHOOK_URL=
# Features the site shows as live, comma-separated.
# LIVE_FEATURES=
EOF

write storefront.env <<EOF
# Made by make-env.sh: leave them as they are. Nothing here to fill in.
PLATFORM_DOMAIN=$PLATFORM_DOMAIN
TRUSTED_EDGE_SECRET=$EDGE_SECRET
STOREFRONT_SECRET=$STOREFRONT_SECRET
CLIENT_IP_HEADER=x-forwarded-for
EOF

write edge.env <<EOF
# Made by make-env.sh: leave them as they are.
PLATFORM_DOMAIN=$PLATFORM_DOMAIN
ACME_EMAIL=$ACME_EMAIL
TRUSTED_EDGE_SECRET=$EDGE_SECRET
ROBOTS=$ROBOTS

# Required: Caddy won't start without it. A Cloudflare API token that can only edit the zone's DNS (deploy/README.md),
# never the server's media token.
CLOUDFLARE_DNS_API_TOKEN=

# With media only: the same two addresses as server.env's, for the dashboard's and console's Content Security Policy.
# MEDIA_PUBLIC_BASE_URL=
# MEDIA_STORAGE_ENDPOINT=
EOF

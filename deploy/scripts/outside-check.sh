#!/usr/bin/env bash
# Checks a deployment from outside, by name, over HTTPS (Slice 9.1, D9-12): every host answers from what is meant to
# answer it. Run by the deploy workflow after each deploy, and by the compose rehearsal in CI.
#
#   outside-check.sh <domain>              e.g. staging.lytro.app
#   CHECK_ADDRESS=127.0.0.1 CHECK_INSECURE=1 outside-check.sh localhost    (the rehearsal: Caddy's own certificates)
#
# A first deploy waits for its certificates, so each check is tried for up to two minutes.
set -euo pipefail

DOMAIN="${1:?usage: outside-check.sh <domain>}"
WAIT_SECONDS="${WAIT_SECONDS:-120}"
failures=0

curl_args=(--silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}')
if [ -n "${CHECK_INSECURE:-}" ]; then curl_args+=(--insecure); fi

# status <host> <path>: the answer's status code, reaching CHECK_ADDRESS when one is given.
status() {
  local host="$1" path="$2" extra=()
  if [ -n "${CHECK_ADDRESS:-}" ]; then extra=(--resolve "$host:443:$CHECK_ADDRESS"); fi
  # curl writes 000 itself when it gets no answer; its reason goes to last_error.
  curl "${curl_args[@]}" "${extra[@]}" "https://$host$path" 2> "$last_error" || true
}
last_error="$(mktemp)"
trap 'rm -f "$last_error"' EXIT

# expect <what> <host> <path> <allowed statuses, space-separated>
expect() {
  local what="$1" host="$2" path="$3" allowed=" $4 " got waited=0
  while :; do
    got="$(status "$host" "$path")"
    if [[ "$allowed" == *" $got "* ]]; then
      printf 'ok    %-44s %s %s\n' "$what" "$got" "https://$host$path"
      return
    fi
    if [ "$waited" -ge "$WAIT_SECONDS" ]; then
      printf 'FAIL  %-44s %s %s (expected %s)\n' "$what" "$got" "https://$host$path" "$4"
      if [ -s "$last_error" ]; then sed 's/^/      /' "$last_error"; fi
      failures=$((failures + 1))
      return
    fi
    sleep 5
    waited=$((waited + 5))
  done
}

expect 'the website' "$DOMAIN" / '200'
expect 'the dashboard' "app.$DOMAIN" / '200'
expect 'the API through the dashboard host' "app.$DOMAIN" /api/v1/auth/providers '200'
expect 'the console' "admin.$DOMAIN" / '200'
expect 'the public API refuses a call without a key' "api.$DOMAIN" /v1/shop '401'
expect 'the payment page host answers from the server' "pay.$DOMAIN" /not-a-page '404'
expect 'a shop that does not exist: the storefront' "no-such-shop-check.$DOMAIN" / '404'

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo 'every host answers'

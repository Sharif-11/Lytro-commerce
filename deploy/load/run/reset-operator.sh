#!/usr/bin/env bash
# Before each load run (run.sh calls it over SSH), Phase 9 Slice 9.10: the load test's operator's second factor is reset,
# so load.js signs in and enrolls afresh, working out the code from the secret enrolment shows. The secret is shown only
# at enrolment, and a run keeps nothing. Run as root on the server under test.
set -euo pipefail

LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
DEPLOY_DIR="$(readlink -f "$LYTRO_HOME/state/current")"
export LYTRO_HOME
set -a
# shellcheck source=/dev/null
. "$LYTRO_HOME/state/release.env"
set +a

dc() { docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/compose.yml" --env-file "$LYTRO_HOME/settings.env" "$@"; }

emails="$(dc exec -T postgres sh -c 'psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT email FROM control.operator_accounts WHERE email LIKE '"'"'load-test-%'"'"'"')"
for email in $emails; do
  dc --profile tools run --rm --no-deps -T migrate node node_modules/@lytronix/db/dist/reset-operator-2fa.js "$email" > /dev/null
  echo "reset the second factor of $email"
done

#!/usr/bin/env bash
# Stands a load test down (Phase 9 Slice 9.10, D9-34), before the real providers come back: disarm.sh runs it, and so
# does every deploy (deploy/scripts/deploy.sh), since a deploy brings the API back with the real providers too. With no
# load test armed, it does nothing. In order:
#
#   1. Every run is told to stop: the stand-in answers its guard's next check 410 (k6/lib/guard.js), and a run still
#      going gets LOAD_STOP_SECONDS (30) to notice.
#   2. What the test queued for an outside service -- SMS, emails, couriers' fraud checks, Meta's purchase events --
#      is answered by the stand-in, still up, for up to DRAIN_SECONDS (180). Whatever is still waiting then, of what was
#      queued since the stand-in was made (arm.sh), is cancelled: none of it goes to a real provider afterwards.
#   3. The stand-in goes.
#   4. RTE-06's per-visitor setting, if arm.sh --ceiling raised it, goes back to what it was.
#
# Staging's live run (2026-11-19) went on placing orders for ten minutes after its disarm, and 49 order SMS went to the
# real BulkSMSBD, refused only because its balance had run out; a second run, stopped before its disarm, still had 24
# order SMS queued when the worker came back on the real provider. Nothing here prints a secret. Run as root.
set -euo pipefail

LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
LOAD_STOP_SECONDS="${LOAD_STOP_SECONDS:-30}"
DRAIN_SECONDS="${DRAIN_SECONDS:-180}"
# The stand-in's plain listener, published on this machine's loopback by compose.load.yml.
OUTSIDE_LOCAL="${OUTSIDE_LOCAL:-http://127.0.0.1:18081}"
# The queues whose jobs call an outside service (packages/validators' QueueName): an order's or a usage warning's SMS,
# an OTP's retried SMS, a courier's fraud check, a purchase told to Meta. guards.test.mjs holds each to QueueName.
OUTSIDE_QUEUES='order_sms otp_retry usage_notice order_fraud_check meta_purchase'

say() { printf '[stand-down %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
# A running container of this server's deployment (compose.yml's project, lytro), by its service's name.
running() { docker ps -q --filter label=com.docker.compose.project=lytro --filter "label=com.docker.compose.service=$1"; }
database="$(running postgres)"
# SQL from stdin, as the database's owner; one value a line out.
sql() { docker exec -i "$database" sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }

stand_in="$(running outside)"
if [ -n "$stand_in" ]; then
  # When arm.sh made the stand-in: what was queued since is the test's. Checked as a time before it reaches SQL.
  armed_at="$(printf '%s\n' "$stand_in" | head -n 1 | xargs docker inspect --format '{{.Created}}')"
  if ! printf '%s' "$armed_at" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'; then
    say "the stand-in's creation time isn't a time ('$armed_at'): stopped, nothing changed"
    exit 1
  fi

  # 1. Every run told to stop, and given the time to.
  going="$(curl -fsS --max-time 5 "$OUTSIDE_LOCAL/load" 2> /dev/null || true)"
  curl -fsS --max-time 5 -X POST -o /dev/null "$OUTSIDE_LOCAL/load/stop" ||
    say "the stand-in didn't take the stop: a run still going stops once it is gone"
  case "$going" in
    *'"running":true'*)
      say "a load run is still going: it stops at its next check; waiting ${LOAD_STOP_SECONDS}s"
      sleep "$LOAD_STOP_SECONDS"
      ;;
  esac

  # 2. The test's outside work answered by the stand-in, or cancelled.
  if [ -n "$database" ]; then
    queues="$(printf "'%s'," $OUTSIDE_QUEUES)"
    queues="${queues%,}"
    queued="SELECT (SELECT count(*) FROM control.job_outbox WHERE status <> 'sent' AND queue_name IN ($queues))
      + (SELECT count(*) FROM pgboss.job WHERE name IN ($queues) AND state IN ('created', 'retry', 'active'))
      + (SELECT count(*) FROM control.sms_outbox WHERE status IN ('pending', 'sending'))
      + (SELECT count(*) FROM control.mail_outbox WHERE status IN ('pending', 'sending'));"
    waited=0
    left="$(printf '%s\n' "$queued" | sql)"
    while [ "$left" != 0 ] && [ "$waited" -lt "$DRAIN_SECONDS" ]; do
      if [ $((waited % 30)) = 0 ]; then
        say "$left SMS, emails, fraud checks or Meta events still queued: the stand-in answers them first"
      fi
      sleep 5
      waited=$((waited + 5))
      left="$(printf '%s\n' "$queued" | sql)"
    done
    if [ "$left" != 0 ]; then
      say "$left still queued after ${DRAIN_SECONDS}s: cancelling what was queued since the test was armed ($armed_at)"
      # pg-boss's own cancel, as its cancel() writes it; a job already running is left to finish on the stand-in.
      sql > /dev/null << SQL
UPDATE pgboss.job SET state = 'cancelled', completed_on = now()
  WHERE name IN ($queues) AND state IN ('created', 'retry') AND created_on >= '$armed_at';
DELETE FROM control.job_outbox
  WHERE status = 'pending' AND queue_name IN ($queues) AND created_at >= '$armed_at';
UPDATE control.sms_outbox SET status = 'failed', last_error = 'cancelled: the load test stood down (D9-34)'
  WHERE status = 'pending' AND created_at >= '$armed_at';
UPDATE control.mail_outbox SET status = 'failed', last_error = 'cancelled: the load test stood down (D9-34)'
  WHERE status = 'pending' AND created_at >= '$armed_at';
SQL
    fi
  else
    say "the database isn't running: nothing queued to wait for"
  fi

  # 3. Only now the stand-in goes.
  say "removing the load test's stand-in"
  printf '%s\n' "$stand_in" | xargs docker rm --force > /dev/null
fi

# 4. The per-visitor setting back.
state="$LYTRO_HOME/state/load-visitor-limit.json"
if [ -e "$state" ]; then
  before="$(cat "$state")"
  # arm.sh wrote the setting's own value: a whole number, and nothing else ever goes into the SQL below.
  case "$before" in
    '' | *[!0-9]*)
      say "$state doesn't hold a whole number; set public_requests_per_visitor_per_minute back by hand"
      exit 1
      ;;
  esac
  if [ -z "$database" ]; then
    say "the database isn't running: public_requests_per_visitor_per_minute stays raised until disarm.sh runs again"
    exit 0
  fi
  printf "UPDATE control.platform_settings SET value = '%s'::jsonb, updated_at = now() WHERE key = 'public_requests_per_visitor_per_minute';\n" "$before" |
    sql > /dev/null
  rm -f "$state"
  say "public_requests_per_visitor_per_minute back to $before"
fi

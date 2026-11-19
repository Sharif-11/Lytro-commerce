#!/usr/bin/env bash
# One load test run, from the load machine (Phase 9 Slice 9.10; deploy/load/README.md): never the server under test,
# whose CPU the load would share. For the production run, the staging server (D9-5, the owner's answer 2026-11-14).
#
#   MODE=pass TARGET=deploy@<server> DOMAIN=lytro.app TARGET_IP=<its address> bash deploy/load/run/run.sh
#
# It opens an SSH tunnel to the stand-in's codes listener on the target (the sign-up burst reads its codes there), starts
# measure.sh on the target, runs k6 (load.js) from this machine through Caddy, then stops the measuring and copies its
# files here. MODE is pass or ceiling; FACTOR, MINUTES, SIGNUPS, STEP, MAX_FACTOR and SKIP are load.js's. MODE=viral runs
# spike.js's viral product instead (VISITS, RAMP_SECONDS, HOLD_MINUTES, SPIKE_SHOP, SPIKE_PRODUCT, LANDING); its flash
# sale runs on the target itself (flash.sh). The roster from seed.sh must be at ./out/roster.json. Results go to ./out/.
set -euo pipefail

: "${TARGET:?the server under test, as ssh reaches it: deploy@<address>}"
: "${DOMAIN:?its PLATFORM_DOMAIN}"
# Options for every ssh and scp, as one string (a key, a known-hosts file): SSH_OPTS="-i <key> -o UserKnownHostsFile=<file>".
SSH_OPTS="${SSH_OPTS:-}"
MODE="${MODE:-pass}"
# A Linux load machine shares its network with the container, so the tunnel is at 127.0.0.1. Docker on Windows or a Mac
# (a developer's machine, as for staging's shakedown) reaches it as host.docker.internal, and Git Bash's paths go to it
# as Windows names them (pwd -W), with its path rewriting off.
export MSYS_NO_PATHCONV=1
if [ "$(uname -s)" = Linux ]; then
  network=(--network host)
  outside=http://127.0.0.1:18081
else
  network=()
  outside=http://host.docker.internal:18081
fi
here() { (cd "$1" && (pwd -W 2> /dev/null || pwd)); }
LOAD_DIR="$(here "$(dirname "$0")/..")"
mkdir -p out
OUT="$(here out)"
K6_IMAGE="${K6_IMAGE:-grafana/k6:1.0.0}"
NAME="$MODE-$(date -u +%Y%m%dT%H%M%SZ)"
export MODE DOMAIN TARGET_IP FACTOR MINUTES RAMP_MINUTES SIGNUPS SIGNUP_MINUTES SIGNUP_START_MINUTES STEP MAX_FACTOR SKIP
export VISITS RAMP_SECONDS HOLD_MINUTES SPIKE_SHOP SPIKE_PRODUCT LANDING
SCRIPT=load.js
[ "$MODE" = viral ] && SCRIPT=spike.js

say() { printf '[run %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
[ -f "$OUT/roster.json" ] || { say "no $OUT/roster.json: copy seed.sh's roster here"; exit 1; }

# D9-34: load goes only to an armed server, whose SMS, couriers, bKash, email and AI are the stand-in, and stops once it
# isn't. Staging's live run (2026-11-19) went on placing orders for ten minutes after its disarm, and 49 order SMS went
# to the real BulkSMSBD, refused only because its balance had run out.
armed() { ssh $SSH_OPTS "$TARGET" 'sudo bash /opt/lytro/state/current/load/run/armed.sh'; }
armed || {
  say "$TARGET isn't armed (arm.sh first): no load goes to a server whose outside services are the real ones"
  exit 1
}
# The run's k6, by name: whatever ends this script stops it too, and so does the watch below.
K6_NAME="lytro-load-$NAME"

say "tunnel to $TARGET's stand-in"
ssh $SSH_OPTS -o ExitOnForwardFailure=yes -N -L 18081:127.0.0.1:18081 "$TARGET" &
tunnel=$!
say "the load test's operator signs in afresh"
ssh $SSH_OPTS "$TARGET" 'sudo bash /opt/lytro/state/current/load/run/reset-operator.sh'
say 'measuring on the target'
ssh $SSH_OPTS "$TARGET" "sudo nohup bash /opt/lytro/state/current/load/run/measure.sh '$NAME' > /dev/null 2>&1 & echo \$! > /tmp/lytro-measure.pid"
watcher=''
stop() {
  # The load first: a run whose script was stopped (or killed, or lost its terminal) mustn't go on without it.
  docker stop "$K6_NAME" > /dev/null 2>&1 || true
  if [ -n "$watcher" ]; then kill "$watcher" 2> /dev/null || true; fi
  ssh $SSH_OPTS "$TARGET" 'sudo kill -TERM "$(cat /tmp/lytro-measure.pid)" 2> /dev/null; sleep 5' || true
  # Through sudo: the folder is root's and the deploy group's, and the SSH user may be in neither (staging's isn't).
  ssh $SSH_OPTS "$TARGET" "sudo sh -c 'cd /opt/lytro/state/load/out && tar -c $NAME-*'" | tar -x -C "$OUT" ||
    say "copy the measurements by hand: /opt/lytro/state/load/out/$NAME-* on the target (readable by root)"
  kill "$tunnel" 2> /dev/null || true
}
trap stop EXIT
# A signal ends the script at once, through stop(): k6 runs in the background below, so nothing waits for it to finish.
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# The target asked every 20 seconds, as k6's own guard asks the stand-in: a deploy brings the real providers back while
# the stand-in may still answer. Two misses in a row stop k6 (one lost SSH connection doesn't).
watch_armed() {
  local missed=0
  while sleep 20; do
    if armed > /dev/null 2>&1; then
      missed=0
      continue
    fi
    missed=$((missed + 1))
    if [ "$missed" -ge 2 ]; then
      say "$TARGET isn't armed any more: stopping k6"
      docker stop "$K6_NAME" > /dev/null 2>&1 || true
      return
    fi
  done
}
watch_armed &
watcher=$!

say "$MODE: k6 from here through Caddy"
# As this user, to write the results here (the image runs as a user of its own).
docker run --rm --name "$K6_NAME" --user "$(id -u):$(id -g)" "${network[@]}" -v "$LOAD_DIR/k6:/scripts:ro" \
  -v "$OUT:/out" -w /scripts \
  -e ROSTER_IN=/out/roster.json -e MODE -e DOMAIN -e TARGET_IP -e FACTOR -e MINUTES -e RAMP_MINUTES -e SIGNUPS \
  -e SIGNUP_MINUTES -e SIGNUP_START_MINUTES -e STEP -e MAX_FACTOR -e SKIP \
  -e VISITS -e RAMP_SECONDS -e HOLD_MINUTES -e SPIKE_SHOP -e SPIKE_PRODUCT -e LANDING \
  -e OUTSIDE="$outside" -e SUMMARY="/out/$NAME-k6.json" \
  "$K6_IMAGE" run "$SCRIPT" > >(tee "$OUT/$NAME-k6.txt") &
# k6's own exit status (99 when a threshold failed, 108 when its guard stopped it), and a signal still gets through.
wait $!
say "done: $OUT/$NAME-*"

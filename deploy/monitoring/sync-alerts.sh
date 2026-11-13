#!/usr/bin/env bash
# Loads deploy/monitoring/alerts.yml into the Grafana Cloud stack's alert rules (Phase 9 Slice 9.6), as namespace
# `lytro`, replacing what's there with exactly the file's rules. Run by the server's admin from a release's copy of
# deploy/ after the file changes (deploy/README.md, "Monitoring"):
#
#   sudo bash deploy/monitoring/sync-alerts.sh
#
# The Grafana settings come from monitoring.env, which only root reads; the token reaches mimirtool through its
# environment, never a command line, and nothing here prints it.
set -euo pipefail

LYTRO_HOME="${LYTRO_HOME:-/opt/lytro}"
DIR="$(cd "$(dirname "$0")" && pwd)"
setting() { sed -n "s/^$1=//p" "$LYTRO_HOME/env/monitoring.env" | head -n 1; }

url="$(setting GRAFANA_METRICS_URL)"
MIMIR_TENANT_ID="$(setting GRAFANA_METRICS_USER)"
MIMIR_API_KEY="$(setting GRAFANA_CLOUD_TOKEN)"
if [ -z "$url" ] || [ -z "$MIMIR_TENANT_ID" ] || [ -z "$MIMIR_API_KEY" ]; then
  echo 'monitoring.env names no Grafana account yet (GRAFANA_METRICS_URL, GRAFANA_METRICS_USER, GRAFANA_CLOUD_TOKEN)'
  exit 1
fi
# The rules live beside the remote write address: https://<stack>/api/prom/push answers rules at https://<stack>/api/prom.
MIMIR_ADDRESS="${url%/push}"
export MIMIR_ADDRESS MIMIR_TENANT_ID MIMIR_API_KEY

# mimirtool's files name their namespace; the repository's stays plain Prometheus, so promtool checks it as it is.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
{
  echo 'namespace: lytro'
  cat "$DIR/alerts.yml"
} > "$work/alerts.yml"

docker run --rm -e MIMIR_ADDRESS -e MIMIR_TENANT_ID -e MIMIR_API_KEY -v "$work:/rules:ro" grafana/mimirtool:3.1.9 \
  rules sync --rule-files=/rules/alerts.yml
echo "loaded $(grep -c '^      - alert:' "$DIR/alerts.yml") alert rules into namespace lytro"

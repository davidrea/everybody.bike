#!/usr/bin/env bash
##
## deploy-watch.sh — Continuous polling wrapper for deploy.sh
##
## Calls deploy.sh every DEPLOY_INTERVAL seconds (default: 60).
## Used by both the systemd service and the Docker deployer service.
##
set -euo pipefail

INTERVAL="${DEPLOY_INTERVAL:-60}"
BRANCH="${DEPLOY_BRANCH:-main}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

cd "$REPO_DIR"

# When running inside a container the mounted repo needs to be marked safe
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

echo "[deploy-watch] Watching '$BRANCH' every ${INTERVAL}s in $REPO_DIR"

while true; do
  "$REPO_DIR/scripts/deploy.sh" 2>&1 || true
  sleep "$INTERVAL"
done

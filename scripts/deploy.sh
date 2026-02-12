#!/usr/bin/env bash
##
## deploy.sh — Smart deploy for everybody.bike
##
## Fetches the latest commits from main, runs tests, then rebuilds and
## redeploys only the services whose inputs actually changed.  Safe to
## call every minute from cron — it exits immediately when nothing is new.
##
## Usage:
##   ./scripts/deploy.sh              # deploy if new commits on main
##   ./scripts/deploy.sh --force      # full rebuild + migrate + restart
##   ./scripts/deploy.sh --dry-run    # show what would happen, don't do it
##
## Setup (pick one):
##   Cron:     * * * * * /home/you/everybody.bike/scripts/deploy.sh >> /var/log/everybody-bike-deploy.log 2>&1
##   Systemd:  systemctl enable --now everybody-bike-deploy
##   Docker:   docker compose --profile deploy up -d
##
set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

BRANCH="${DEPLOY_BRANCH:-main}"
FORCE=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --force)   FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

# ---------------------------------------------------------------------------
# Locking — prevent concurrent deploys (auto-released on exit)
# ---------------------------------------------------------------------------
LOCK_FILE="/tmp/everybody-bike-deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[deploy] Another deploy is already running. Skipping."
  exit 0
fi

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log() { echo "[deploy $(date '+%Y-%m-%dT%H:%M:%S%z')] $*"; }

# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------
if ! git fetch origin "$BRANCH" 2>&1; then
  log "ERROR: git fetch failed. Will retry next run."
  exit 1
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ] && [ "$FORCE" = false ]; then
  exit 0  # nothing to do — keep logs clean
fi

if [ "$FORCE" = true ]; then
  log "Forced deploy requested."
else
  log "New commits: $(git rev-parse --short "$LOCAL")..$(git rev-parse --short "$REMOTE")"
  git log --oneline "$LOCAL".."$REMOTE" 2>/dev/null | while IFS= read -r line; do
    log "  $line"
  done
fi

# ---------------------------------------------------------------------------
# Classify changed files
# ---------------------------------------------------------------------------
REBUILD_APP=false
RUN_MIGRATIONS=false
RESTART_KONG=false
RESTART_AUTH=false
RESTART_CRON=false
RECREATE_ALL=false

if [ "$FORCE" = true ]; then
  REBUILD_APP=true
  RUN_MIGRATIONS=true
  RECREATE_ALL=true
else
  CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")

  while IFS= read -r file; do
    case "$file" in
      # App source / build config
      src/*|package.json|package-lock.json|Dockerfile|next.config.ts|\
      public/*|tsconfig.json|postcss.config.mjs|components.json)
        REBUILD_APP=true ;;

      # Database migrations
      supabase/migrations/*)
        RUN_MIGRATIONS=true ;;

      # Kong API gateway config
      volumes/api/*)
        RESTART_KONG=true ;;

      # Auth email templates
      supabase/templates/*)
        RESTART_AUTH=true ;;

      # Cron schedule
      scripts/crontab)
        RESTART_CRON=true ;;

      # Docker Compose definition itself
      docker-compose.yml)
        RECREATE_ALL=true ;;
    esac
  done <<< "$CHANGED"
fi

# Check if anything deployment-relevant changed
if [ "$REBUILD_APP" = false ] && [ "$RUN_MIGRATIONS" = false ] && \
   [ "$RESTART_KONG" = false ] && [ "$RESTART_AUTH" = false ] && \
   [ "$RESTART_CRON" = false ] && [ "$RECREATE_ALL" = false ]; then
  # Still pull (docs, scripts, etc. may have changed) but nothing to deploy
  git merge --ff-only "origin/$BRANCH" 2>&1 || true
  log "Pulled $(git rev-parse --short HEAD) — no deployment-relevant changes."
  exit 0
fi

# ---------------------------------------------------------------------------
# Summarise plan
# ---------------------------------------------------------------------------
log "Deploy plan:"
[ "$REBUILD_APP"    = true ] && log "  - Rebuild & restart app"
[ "$RUN_MIGRATIONS" = true ] && log "  - Run database migrations"
[ "$RESTART_KONG"   = true ] && log "  - Restart Kong (gateway config)"
[ "$RESTART_AUTH"   = true ] && log "  - Restart auth (email templates)"
[ "$RESTART_CRON"   = true ] && log "  - Restart cron service"
[ "$RECREATE_ALL"   = true ] && log "  - Recreate all services (compose file changed)"

if [ "$DRY_RUN" = true ]; then
  log "Dry run — stopping here."
  exit 0
fi

# ---------------------------------------------------------------------------
# Pull
# ---------------------------------------------------------------------------
log "Pulling changes..."
if ! git merge --ff-only "origin/$BRANCH" 2>&1; then
  log "ERROR: Fast-forward merge failed. Resolve manually: git status"
  exit 1
fi

# ---------------------------------------------------------------------------
# Run tests (gate the deploy)
# ---------------------------------------------------------------------------
if [ "$REBUILD_APP" = true ] || [ "$RUN_MIGRATIONS" = true ]; then
  log "Running tests..."
  # Build the lightweight 'test' stage (deps + source, no Next.js build).
  # Docker layer cache makes this fast when only source files changed.
  if ! docker build --target test -t everybody-bike-test -f Dockerfile . 2>&1; then
    log "ERROR: Test image build failed."
    exit 1
  fi
  if ! docker run --rm everybody-bike-test npm test 2>&1; then
    log "ERROR: Tests failed — aborting deploy."
    exit 1
  fi
  log "Tests passed."
fi

# ---------------------------------------------------------------------------
# Deploy actions
# ---------------------------------------------------------------------------
FAILED=false

# 1. Rebuild app image & restart
if [ "$REBUILD_APP" = true ]; then
  log "Building app image..."
  if docker compose build app 2>&1; then
    log "Starting updated app..."
    docker compose up -d --no-deps app 2>&1
  else
    log "ERROR: App build failed!"
    FAILED=true
  fi
fi

# 2. Run database migrations
if [ "$RUN_MIGRATIONS" = true ]; then
  log "Running database migrations..."
  if ! docker compose run --rm migrate 2>&1; then
    log "ERROR: Migration failed! Inspect: docker compose run --rm migrate"
    FAILED=true
  fi
fi

# 3. Restart Kong (config changed)
if [ "$RESTART_KONG" = true ]; then
  log "Restarting Kong..."
  docker compose up -d --force-recreate --no-deps kong 2>&1
fi

# 4. Restart auth (templates changed)
if [ "$RESTART_AUTH" = true ]; then
  log "Restarting auth..."
  docker compose restart auth 2>&1
fi

# 5. Restart cron (schedule changed)
if [ "$RESTART_CRON" = true ]; then
  log "Restarting cron..."
  docker compose up -d --force-recreate --no-deps cron 2>&1
fi

# 6. Full recreate (docker-compose.yml itself changed)
if [ "$RECREATE_ALL" = true ]; then
  log "Recreating all services..."
  docker compose up -d 2>&1
fi

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
if [ "$REBUILD_APP" = true ] || [ "$RECREATE_ALL" = true ]; then
  log "Checking app health..."
  HEALTHY=false
  for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://localhost:${APP_PORT:-3000}/; then
      HEALTHY=true
      break
    fi
    sleep 2
  done
  if [ "$HEALTHY" = true ]; then
    log "App is healthy."
  else
    log "WARNING: App not responding after 60 s. Check: docker compose logs app"
    FAILED=true
  fi
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
if [ "$FAILED" = true ]; then
  log "Deploy finished WITH ERRORS at $(git rev-parse --short HEAD)."
  exit 1
fi

log "Deploy complete: $(git rev-parse --short HEAD)"

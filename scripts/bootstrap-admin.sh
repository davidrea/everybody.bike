#!/bin/bash
#
# Bootstrap the first super_admin user.
#
# Creates a user via the Supabase admin API, sets their profile to super_admin,
# and prints a magic link URL + OTP code to the terminal (no email required).
#
# Prerequisites:
#   - docker compose stack running (at least: db, kong, auth, rest)
#   - .env file with secrets populated
#   - curl and jq installed
#
# Usage:
#   bash scripts/bootstrap-admin.sh --email admin@example.com --name "Jane Smith"
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

EMAIL=""
NAME=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --email) EMAIL="$2"; shift 2 ;;
    --name)  NAME="$2";  shift 2 ;;
    -h|--help)
      echo "Usage: bash scripts/bootstrap-admin.sh --email <email> --name <full name>"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$EMAIL" ]]; then
  echo "Error: --email is required"
  echo "Usage: bash scripts/bootstrap-admin.sh --email admin@example.com --name \"Jane Smith\""
  exit 1
fi

if [[ -z "$NAME" ]]; then
  NAME="$EMAIL"
fi

# ---------------------------------------------------------------------------
# Load .env
# ---------------------------------------------------------------------------

ENV_FILE=".env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Copy .env.production.example to .env first."
  exit 1
fi

# Load .env safely (supports values with spaces/symbols without quoting)
while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip comments and blank lines
  if [[ "$line" =~ ^[[:space:]]*# ]] || [[ "$line" =~ ^[[:space:]]*$ ]]; then
    continue
  fi

  # Split on first '='
  key="${line%%=*}"
  value="${line#*=}"

  # Trim whitespace and optional surrounding quotes
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  value="${value%$'\r'}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ "$value" =~ ^\".*\"$ ]] || [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi

  export "${key}=${value}"
done < "$ENV_FILE"

KONG_PORT="${KONG_HTTP_PORT:-8000}"
KONG_URL="http://localhost:${KONG_PORT}"

# ---------------------------------------------------------------------------
# Resolve service role key (prefer explicit env; fallback to local supabase status)
# ---------------------------------------------------------------------------

if [[ -z "${SERVICE_ROLE_KEY:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
fi

if [[ -z "${SERVICE_ROLE_KEY:-}" ]]; then
  if command -v npx >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    STATUS_JSON="$(npx supabase status --output json 2>/dev/null || true)"
    if [[ -n "$STATUS_JSON" ]]; then
      SERVICE_ROLE_KEY="$(echo "$STATUS_JSON" | jq -r '.SERVICE_ROLE_KEY // .SECRET_KEY // empty')"
    fi
  fi
fi

if [[ -z "${SERVICE_ROLE_KEY:-}" ]]; then
  echo "Error: SERVICE_ROLE_KEY not set in .env and could not be read from supabase status"
  exit 1
fi

# ---------------------------------------------------------------------------
# Check dependencies
# ---------------------------------------------------------------------------

for cmd in curl jq; do
  if ! command -v $cmd &>/dev/null; then
    echo "Error: $cmd is required but not found. Install it first."
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Verify Kong is reachable
# ---------------------------------------------------------------------------

echo "Checking Supabase API gateway..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${KONG_URL}/auth/v1/health" || true)
if [[ "$HEALTH_STATUS" != "200" && "$HEALTH_STATUS" != "401" ]]; then
  echo "Error: Cannot reach Kong at ${KONG_URL} (status: ${HEALTH_STATUS})"
  echo "Make sure the stack is running: docker compose up -d"
  exit 1
fi
echo "  API gateway OK (status: ${HEALTH_STATUS})"

# ---------------------------------------------------------------------------
# Step 1: Create user via GoTrue admin API
# ---------------------------------------------------------------------------

echo ""
echo "Creating user: ${EMAIL} (${NAME})..."

CREATE_RESPONSE=$(curl -sf -X POST "${KONG_URL}/auth/v1/admin/users" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${EMAIL}\",
    \"email_confirm\": true,
    \"user_metadata\": {
      \"full_name\": \"${NAME}\"
    }
  }" 2>&1) || true

USER_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id // empty')

if [[ -z "$USER_ID" ]]; then
  # User might already exist — try to look them up
  echo "  User may already exist, looking up..."

  LIST_RESPONSE=$(curl -sf -X GET "${KONG_URL}/auth/v1/admin/users" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "apikey: ${SERVICE_ROLE_KEY}" 2>&1)

  USER_ID=$(echo "$LIST_RESPONSE" | jq -r ".users[] | select(.email == \"${EMAIL}\") | .id" 2>/dev/null)

  if [[ -z "$USER_ID" ]]; then
    echo "Error: Could not create or find user."
    echo "Response: ${CREATE_RESPONSE}"
    exit 1
  fi

  echo "  Found existing user: ${USER_ID}"
else
  echo "  Created user: ${USER_ID}"
fi

# ---------------------------------------------------------------------------
# Step 2: Update profile to super_admin
# ---------------------------------------------------------------------------

echo "Setting super_admin role..."

PROFILE_RESPONSE=$(curl -sf -X PATCH \
  "${KONG_URL}/rest/v1/profiles?id=eq.${USER_ID}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{
    \"full_name\": \"${NAME}\",
    \"roles\": [\"super_admin\", \"admin\"],
    \"invite_status\": \"accepted\"
  }" 2>&1)

echo "  Profile updated"

# ---------------------------------------------------------------------------
# Step 3: Generate magic link + OTP
# ---------------------------------------------------------------------------

echo "Generating login link..."

SITE="${SITE_URL:-http://localhost:3000}"
SITE="${SITE%/}"
REDIRECT_TO="${SITE}/auth/callback"

LINK_RESPONSE=$(curl -sf -X POST "${KONG_URL}/auth/v1/admin/generate_link" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"magiclink\",
    \"email\": \"${EMAIL}\",
    \"redirect_to\": \"${REDIRECT_TO}\"
  }" 2>&1)

ACTION_LINK=$(echo "$LINK_RESPONSE" | jq -r '.properties.action_link // .action_link // empty')
EMAIL_OTP=$(echo "$LINK_RESPONSE" | jq -r '.properties.email_otp // .email_otp // empty')

if [[ -z "$ACTION_LINK" && -z "$EMAIL_OTP" ]]; then
  echo "Error: Could not generate login link."
  echo "Response: ${LINK_RESPONSE}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Done — print credentials
# ---------------------------------------------------------------------------

echo ""
echo "=============================================="
echo "  Bootstrap complete!"
echo "=============================================="
echo ""
echo "  User:  ${NAME} <${EMAIL}>"
echo "  Roles: super_admin, admin"
echo "  ID:    ${USER_ID}"
echo ""

if [[ -n "$EMAIL_OTP" ]]; then
  echo "  OTP Code: ${EMAIL_OTP}"
  echo "  (Enter this on the login page after requesting a magic link)"
  echo ""
fi

if [[ -n "$ACTION_LINK" ]]; then
  echo "  Magic Link (open in browser):"
  echo "  ${ACTION_LINK}"
  echo ""
fi

echo "  The OTP code and magic link expire in 12 hours."
echo ""
echo "  Next steps:"
echo "    1. Open ${SITE}/login in your browser"
echo "    2. Enter ${EMAIL} and use the OTP code above"
echo "       (or open the magic link directly)"
echo "    3. You'll land on the dashboard as super_admin"
echo ""

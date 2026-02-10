#!/bin/sh
#
# Generate all Supabase infrastructure secrets.
# Based on the official Supabase generate-keys.sh script.
#
# Usage:
#   bash scripts/generate-keys.sh
#   # Review output, then paste into your .env file
#
# Portions derived from Inder Singh's setup.sh (Apache License 2.0).
#

set -e

gen_hex() {
    openssl rand -hex "$1"
}

gen_base64() {
    openssl rand -base64 "$1"
}

base64_url_encode() {
    openssl enc -base64 -A | tr '+/' '-_' | tr -d '='
}

gen_token() {
    payload=$1
    payload_base64=$(printf %s "$payload" | base64_url_encode)
    header_base64=$(printf %s "$header" | base64_url_encode)
    signed_content="${header_base64}.${payload_base64}"
    signature=$(printf %s "$signed_content" | openssl dgst -binary -sha256 -hmac "$jwt_secret" | base64_url_encode)
    printf '%s' "${signed_content}.${signature}"
}

if ! command -v openssl >/dev/null 2>&1; then
    echo "Error: openssl is required but not found."
    exit 1
fi

jwt_secret="$(gen_base64 30)"

header='{"alg":"HS256","typ":"JWT"}'
iat=$(date +%s)
exp=$((iat + 5 * 3600 * 24 * 365)) # 5 years

anon_payload="{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":$iat,\"exp\":$exp}"
service_role_payload="{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":$iat,\"exp\":$exp}"

anon_key=$(gen_token "$anon_payload")
service_role_key=$(gen_token "$service_role_payload")

secret_key_base=$(gen_base64 48)
vault_enc_key=$(gen_hex 16)
pg_meta_crypto_key=$(gen_base64 24)
logflare_public_access_token=$(gen_base64 24)
logflare_private_access_token=$(gen_base64 24)
postgres_password=$(gen_hex 16)
dashboard_password=$(gen_hex 16)

echo ""
echo "# === Supabase Infrastructure Secrets ==="
echo "# Paste these into your .env file"
echo ""
echo "JWT_SECRET=${jwt_secret}"
echo ""
echo "ANON_KEY=${anon_key}"
echo "SERVICE_ROLE_KEY=${service_role_key}"
echo ""
echo "POSTGRES_PASSWORD=${postgres_password}"
echo "DASHBOARD_PASSWORD=${dashboard_password}"
echo ""
echo "SECRET_KEY_BASE=${secret_key_base}"
echo "VAULT_ENC_KEY=${vault_enc_key}"
echo "PG_META_CRYPTO_KEY=${pg_meta_crypto_key}"
echo "LOGFLARE_PUBLIC_ACCESS_TOKEN=${logflare_public_access_token}"
echo "LOGFLARE_PRIVATE_ACCESS_TOKEN=${logflare_private_access_token}"
echo ""

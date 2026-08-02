#!/usr/bin/env bash
set -euo pipefail

# Simple wrapper around bulk-sync-users.mjs.
# Apply mode is default; pass --dry-run to preview changes.
#
# Usage:
#   KEYCLOAK_CLIENT_SECRET='<secret>' ./scripts/keycloak/run-bulk-sync.sh /path/to/users.json
#   KEYCLOAK_CLIENT_SECRET='<secret>' ./scripts/keycloak/run-bulk-sync.sh /path/to/users.json --dry-run
#
# Optional env overrides:
#   KEYCLOAK_BASE_URL (default: http://127.0.0.1:8082)
#   KEYCLOAK_REALM    (default: mle-test-realm)
#   KEYCLOAK_CLIENT_ID(default: user-sync-admin)

if [[ $# -lt 1 ]]; then
  echo "Usage: KEYCLOAK_CLIENT_SECRET='<secret>' $0 /path/to/users.json [--dry-run]"
  exit 1
fi

USER_FILE="$1"
MODE="--apply"

if [[ $# -ge 2 && "$2" == "--dry-run" ]]; then
  MODE="--dry-run"
fi

if [[ ! -f "$USER_FILE" ]]; then
  echo "[ERROR] JSON file not found: $USER_FILE"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] node is required but not found in PATH."
  exit 1
fi

if [[ -z "${KEYCLOAK_CLIENT_SECRET:-}" ]]; then
  echo "[ERROR] KEYCLOAK_CLIENT_SECRET is required."
  exit 1
fi

export KEYCLOAK_BASE_URL="${KEYCLOAK_BASE_URL:-http://127.0.0.1:8082}"
export KEYCLOAK_REALM="${KEYCLOAK_REALM:-mle-test-realm}"
export KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-user-sync-admin}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/bulk-sync-users.mjs"

if [[ ! -f "$SYNC_SCRIPT" ]]; then
  echo "[ERROR] Sync script not found: $SYNC_SCRIPT"
  exit 1
fi

echo "[INFO] Running Keycloak bulk sync"
echo "[INFO] Base URL: $KEYCLOAK_BASE_URL"
echo "[INFO] Realm: $KEYCLOAK_REALM"
echo "[INFO] Client ID: $KEYCLOAK_CLIENT_ID"
echo "[INFO] Input file: $USER_FILE"
echo "[INFO] Mode: $MODE"

node "$SYNC_SCRIPT" --file "$USER_FILE" "$MODE"

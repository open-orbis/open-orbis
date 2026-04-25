#!/usr/bin/env bash
# Local-dev helper for testing the ChatGPT Apps integration end-to-end
# against a real ChatGPT account in Developer Mode.
#
# Spins up two cloudflared tunnels:
#   - Frontend  (localhost:5173 -> https://xxx.trycloudflare.com)
#     covers /oauth/*, /.well-known/*, /api/* (Vite dev proxy), and
#     /chatgpt-widgets/* (built bundles served by Vite from public/)
#   - MCP       (localhost:8081 -> https://yyy.trycloudflare.com)
#     the streamable-http transport ChatGPT calls for tools/resources
#
# After this script prints the URLs:
#   1. Update backend/.env and frontend/.env.local with the printed values
#   2. Restart backend (uvicorn), MCP (python -m mcp_server.server) and Vite
#   3. Add the printed Google + LinkedIn callback URLs to those OAuth clients'
#      authorized-redirect-URI whitelists (one-time per tunnel URL)
#   4. ChatGPT: Settings -> Apps & Connectors -> Advanced -> Developer mode ON
#      -> Add custom connector -> paste the printed MCP URL
#
# Cloudflared free-tier URLs change on every restart of this script, so steps
# 1 and 3 have to be redone each session. For a stable URL, pay ngrok ($8/mo)
# or stand up a custom domain on your cloudflare account.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Pre-flight ────────────────────────────────────────────────────────────────

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "✗ cloudflared not found. Install with:  brew install cloudflared"
  exit 1
fi

WIDGET_DIR="$ROOT/frontend/public/chatgpt-widgets"
if [ ! -d "$WIDGET_DIR" ] || [ -z "$(ls -A "$WIDGET_DIR" 2>/dev/null)" ]; then
  echo "» Building chatgpt-apps widget bundles (one-time)…"
  (cd "$ROOT/frontend/chatgpt-apps" && npm run build)
fi

# ── Cleanup on exit ──────────────────────────────────────────────────────────

LOG_DIR="$(mktemp -d -t orbis-chatgpt-XXXXX)"
FRONTEND_LOG="$LOG_DIR/frontend-tunnel.log"
MCP_LOG="$LOG_DIR/mcp-tunnel.log"
FRONTEND_PID=""
MCP_PID=""

cleanup() {
  echo ""
  echo "» Shutting down tunnels…"
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$MCP_PID" ] && kill "$MCP_PID" 2>/dev/null || true
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT INT TERM

# ── Launch tunnels ───────────────────────────────────────────────────────────

echo "» Starting cloudflared tunnels…"
cloudflared tunnel --url http://localhost:5173 --no-autoupdate >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
cloudflared tunnel --url http://localhost:8081 --no-autoupdate >"$MCP_LOG" 2>&1 &
MCP_PID=$!

extract_url() {
  local log="$1"
  local i=0
  while [ "$i" -lt 45 ]; do
    local url
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" 2>/dev/null | head -n 1 || true)
    if [ -n "$url" ]; then
      echo "$url"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

echo "» Waiting for tunnel URLs (up to 45s each)…"
FRONTEND_URL="$(extract_url "$FRONTEND_LOG")" || {
  echo "✗ Frontend tunnel failed to come up. Log:"
  cat "$FRONTEND_LOG"
  exit 1
}
MCP_URL="$(extract_url "$MCP_LOG")" || {
  echo "✗ MCP tunnel failed to come up. Log:"
  cat "$MCP_LOG"
  exit 1
}

FRONTEND_HOST="${FRONTEND_URL#https://}"

# ── Print config ─────────────────────────────────────────────────────────────

cat <<EOF

═══════════════════════════════════════════════════════════════════════════
  Tunnels live
─────────────────────────────────────────────────────────────────────────
  Frontend  $FRONTEND_URL
  MCP       $MCP_URL/mcp
═══════════════════════════════════════════════════════════════════════════

▌ backend/.env  (then restart uvicorn + mcp_server.server)

  FRONTEND_URL=$FRONTEND_URL
  COOKIE_DOMAIN=$FRONTEND_HOST
  LINKEDIN_REDIRECT_URI=$FRONTEND_URL/auth/linkedin/callback
  CLOUD_RUN_URL=$MCP_URL

▌ frontend/.env.local  (then restart Vite dev)

  VITE_API_URL=$FRONTEND_URL/api
  VITE_MCP_URL=$MCP_URL/mcp

▌ Google OAuth client (console.cloud.google.com → APIs → Credentials)
   Add to "Authorized redirect URIs":

  $FRONTEND_URL/auth/callback

▌ LinkedIn OAuth client (linkedin.com/developers → your app → Auth)
   Add to "Authorized redirect URLs":

  $FRONTEND_URL/auth/linkedin/callback

▌ ChatGPT
   Settings → Apps & Connectors → Advanced settings → Developer mode → ON
   "Add custom connector" → URL:

  $MCP_URL/mcp

═══════════════════════════════════════════════════════════════════════════
  Tunnels stay live. Ctrl+C to tear down.
═══════════════════════════════════════════════════════════════════════════

EOF

# Hold the script alive; clean shutdown on Ctrl+C.
wait

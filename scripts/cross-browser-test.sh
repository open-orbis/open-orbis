#!/bin/bash
set -euo pipefail

# Cross-browser smoke test launcher for macOS.
# Opens the Orbis dev server in every installed browser.
#
# Usage: ./scripts/cross-browser-test.sh [URL]
#   URL defaults to http://localhost:5173

URL="${1:-http://localhost:5173}"

declare -a BROWSER_NAMES=("Chrome" "Firefox" "Safari" "Edge" "Arc" "Brave")
declare -a BROWSER_APPS=("Google Chrome" "Firefox" "Safari" "Microsoft Edge" "Arc" "Brave Browser")

opened=()
skipped=()

# Check if the dev server is reachable
http_code=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo "000")
if [ "$http_code" = "000" ]; then
  echo "WARNING: $URL is not reachable. Start the dev server first:"
  echo "  cd frontend && npm run dev"
  echo ""
fi

echo "Opening $URL in all available browsers..."
echo ""

for i in "${!BROWSER_NAMES[@]}"; do
  name="${BROWSER_NAMES[$i]}"
  app="${BROWSER_APPS[$i]}"

  if [ -d "/Applications/${app}.app" ]; then
    open -a "$app" "$URL"
    opened+=("$name")
  else
    skipped+=("$name")
  fi
done

echo "--- Summary ---"
echo ""
for name in "${opened[@]}"; do
  echo "  [ok]  $name"
done
for name in "${skipped[@]}"; do
  echo "  [--]  $name (not installed)"
done
echo ""
echo "Opened ${#opened[@]}/${#BROWSER_NAMES[@]} browsers."
echo ""
echo "Follow the checklist: docs/cross-browser-checklist.md"

#!/usr/bin/env bash
# dsh-token-meter-panel installer (macOS / Linux)
#
# Usage:
#   bash install.sh                 # latest
#   bash install.sh v0.6.0          # specific version
#   PROFILE=web bash install.sh     # another profile (default: desktop)
set -euo pipefail

REPO="olimc2016/dsh-token-meter-panel"
PKG="dsh-token-meter-panel"
VERSION="${1:-latest}"
PROFILE="${PROFILE:-desktop}"

SPEC="github:$REPO"
[ "$VERSION" != "latest" ] && SPEC="$SPEC#$VERSION"

echo "== $PKG installer =="

if command -v dsh >/dev/null 2>&1; then
  echo "using DSH CLI: $(command -v dsh)"
  dsh plugin --profile "$PROFILE" add "$SPEC"
elif command -v npx >/dev/null 2>&1; then
  echo "dsh not found; falling back to npx @deepseek-ai/dsh"
  npx --yes '@deepseek-ai/dsh' plugin --profile "$PROFILE" add "$SPEC"
else
  echo "Neither 'dsh' nor 'npx' is available. Install DSH first: https://github.com/deepseek-ai" >&2
  exit 1
fi

INSTALLED="$HOME/.dsh/profiles/$PROFILE/node_modules/$PKG/package.json"
if [ -f "$INSTALLED" ]; then
  echo "installed $PKG $(grep -o '"version": *"[^"]*"' "$INSTALLED" | head -1)"
fi

echo
echo "NEXT: fully quit DSH and start it again, then open the 'Token' panel."
echo "Future updates install themselves in the background (restart DSH to apply)."

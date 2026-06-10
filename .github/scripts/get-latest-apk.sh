#!/usr/bin/env bash
# Obtiene el APK más reciente de un perfil EAS (production | develop | demo).
set -euo pipefail

PROFILE="${1:?perfil requerido: production, develop o demo}"
ACCOUNT="tradebotg"
PROJECT="padel-app"

BUILDS_JSON=$(eas build:list \
  --platform android \
  --build-profile "$PROFILE" \
  --status finished \
  --limit 1 \
  --json \
  --non-interactive 2>/dev/null || echo '[]')

BUILD=$(echo "$BUILDS_JSON" | jq -r 'if type == "array" then .[0] elif .builds then .builds[0] else empty end')

INSTALL_URL=$(echo "$BUILD" | jq -r '.artifacts.buildUrl // .artifacts.applicationArchiveUrl // empty')
BUILD_ID=$(echo "$BUILD" | jq -r '.id // empty')

if [ -n "$BUILD_ID" ]; then
  BUILD_PAGE_URL="https://expo.dev/accounts/${ACCOUNT}/projects/${PROJECT}/builds/${BUILD_ID}"
else
  BUILD_PAGE_URL=""
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "install_url=${INSTALL_URL}" >> "$GITHUB_OUTPUT"
  echo "build_id=${BUILD_ID}" >> "$GITHUB_OUTPUT"
  echo "build_page_url=${BUILD_PAGE_URL}" >> "$GITHUB_OUTPUT"
else
  echo "install_url=${INSTALL_URL}"
  echo "build_id=${BUILD_ID}"
  echo "build_page_url=${BUILD_PAGE_URL}"
fi

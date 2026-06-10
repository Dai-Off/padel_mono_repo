#!/usr/bin/env bash
# Build Android APK con EAS y expone install_url / build_page_url en GITHUB_OUTPUT.
set -euo pipefail

PROFILE="${1:?perfil requerido: production, develop o demo}"
OUTPUT_FILE="${2:-../eas-build.json}"
ACCOUNT="tradebotg"
PROJECT="padel-app"

echo "Building Android APK for profile: ${PROFILE}"

eas build \
  --platform android \
  --profile "$PROFILE" \
  --non-interactive \
  --json > "$OUTPUT_FILE"

cat "$OUTPUT_FILE"

BUILD=$(jq -r 'if type == "array" then .[0] else . end' "$OUTPUT_FILE")
BUILD_ID=$(echo "$BUILD" | jq -r '.id // empty')
INSTALL_URL=$(echo "$BUILD" | jq -r '.artifacts.buildUrl // .artifacts.applicationArchiveUrl // empty')
STATUS=$(echo "$BUILD" | jq -r '.status // empty')

if [ -z "$INSTALL_URL" ]; then
  echo "Build sin URL de APK. status=${STATUS:-unknown}"
  exit 1
fi

if [ -n "$BUILD_ID" ]; then
  BUILD_PAGE_URL="https://expo.dev/accounts/${ACCOUNT}/projects/${PROJECT}/builds/${BUILD_ID}"
else
  BUILD_PAGE_URL=""
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "install_url=${INSTALL_URL}" >> "$GITHUB_OUTPUT"
  echo "build_id=${BUILD_ID}" >> "$GITHUB_OUTPUT"
  echo "build_page_url=${BUILD_PAGE_URL}" >> "$GITHUB_OUTPUT"
  echo "expo_url=${BUILD_PAGE_URL}" >> "$GITHUB_OUTPUT"
fi

#!/usr/bin/env bash
# Decide si publicar OTA o generar APK nuevo comparando fingerprints de Expo.
# OTA: solo cambios JS/TS compatibles con el APK instalado.
# Build: sin APK, o cambios nativos (deps, plugins, android/, app.json, etc.).
set -euo pipefail

PROFILE="${1:?perfil requerido: production, develop o demo}"

echo "Comparing fingerprints for profile: ${PROFILE}"

FP_JSON=$(eas fingerprint:generate \
  --platform android \
  --build-profile "$PROFILE" \
  --json \
  --non-interactive 2>/dev/null || echo '{}')

CURRENT_HASH=$(echo "$FP_JSON" | jq -r '
  if type == "array" then .[0].hash
  elif .hash then .hash
  elif .fingerprints.android.hash then .fingerprints.android.hash
  else empty end')

BUILDS_JSON=$(eas build:list \
  --platform android \
  --build-profile "$PROFILE" \
  --status finished \
  --limit 1 \
  --json \
  --non-interactive 2>/dev/null || echo '[]')

BUILD=$(echo "$BUILDS_JSON" | jq -r 'if type == "array" then .[0] elif .builds then .builds[0] else empty end')
BUILD_HASH=$(echo "$BUILD" | jq -r '.fingerprint.hash // empty')
INSTALL_URL=$(echo "$BUILD" | jq -r '.artifacts.buildUrl // .artifacts.applicationArchiveUrl // empty')

STRATEGY="ota"
REASON="compatible"

if [ -z "$INSTALL_URL" ]; then
  STRATEGY="build"
  REASON="no_apk"
elif [ -z "$CURRENT_HASH" ]; then
  STRATEGY="build"
  REASON="fingerprint_unavailable"
elif [ -z "$BUILD_HASH" ]; then
  STRATEGY="build"
  REASON="missing_build_fingerprint"
elif [ "$CURRENT_HASH" != "$BUILD_HASH" ]; then
  STRATEGY="build"
  REASON="native_changes"
fi

echo "Strategy: ${STRATEGY} (${REASON})"
echo "Current fingerprint: ${CURRENT_HASH:-none}"
echo "Last build fingerprint: ${BUILD_HASH:-none}"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "strategy=${STRATEGY}" >> "$GITHUB_OUTPUT"
  echo "reason=${REASON}" >> "$GITHUB_OUTPUT"
  echo "current_fingerprint=${CURRENT_HASH}" >> "$GITHUB_OUTPUT"
  echo "build_fingerprint=${BUILD_HASH}" >> "$GITHUB_OUTPUT"
fi

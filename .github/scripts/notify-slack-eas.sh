#!/usr/bin/env bash
# Envía aviso a Slack vía Incoming Webhook.
# Uso: notify-slack-eas.sh <ota|build> <production|develop|demo>
# Env: SLACK_WEBHOOK_URL, BRANCH, CHANNEL, COMMIT_MSG, ACTOR, EXPO_URL, RUN_URL,
#      INSTALL_URL, BUILD_PAGE_URL
set -euo pipefail

TYPE="${1:?tipo requerido: ota o build}"
ENV_KEY="${2:?ambiente requerido: production, develop o demo}"

SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "SLACK_WEBHOOK_URL no configurado — aviso omitido."
  exit 0
fi

BRANCH="${BRANCH:-}"
CHANNEL="${CHANNEL:-}"
COMMIT_MSG="${COMMIT_MSG:-}"
ACTOR="${ACTOR:-github-actions}"
EXPO_URL="${EXPO_URL:-}"
RUN_URL="${RUN_URL:-}"
INSTALL_URL="${INSTALL_URL:-}"
BUILD_PAGE_URL="${BUILD_PAGE_URL:-}"

case "$ENV_KEY" in
  production)
    ENV_LABEL="Producción"
    ENV_EMOJI=":red_circle:"
    COLOR="#E01E5A"
    ;;
  develop)
    ENV_LABEL="Develop"
    ENV_EMOJI=":large_blue_circle:"
    COLOR="#36C5F0"
    ;;
  demo)
    ENV_LABEL="Demo"
    ENV_EMOJI=":large_green_circle:"
    COLOR="#2EB67D"
    ;;
  *)
    ENV_LABEL="$ENV_KEY"
    ENV_EMOJI=":package:"
    COLOR="#ECB22E"
    ;;
esac

if [ "$TYPE" = "ota" ]; then
  TITLE="${ENV_EMOJI} ${ENV_LABEL} — actualización OTA publicada"
  BODY=$'*¿Ya tenés la app?* Se actualiza sola al abrirla.\n*¿No la tenés?* Instalá el APK de este ambiente (link o QR abajo).'
  CTA_LABEL="Ver updates en Expo"
else
  TITLE="${ENV_EMOJI} ${ENV_LABEL} — build Android listo"
  BODY=$'Nuevo APK publicado. Usá el link directo o el QR para instalar en Android.'
  CTA_LABEL="Ver build en Expo"
fi

COMMIT_LINE=""
if [ -n "$COMMIT_MSG" ]; then
  COMMIT_LINE="*Commit:* ${COMMIT_MSG}"
else
  COMMIT_LINE="*Disparado por:* ${ACTOR}"
fi

if [ "$TYPE" = "ota" ]; then
  FIELDS_JSON=$(jq -n \
    --arg branch "$BRANCH" \
    --arg channel "$CHANNEL" \
    '[
      {type:"mrkdwn", text: ("*Rama:*\n" + $branch)},
      {type:"mrkdwn", text: ("*Canal EAS:*\n" + $channel)}
    ]')
else
  FIELDS_JSON=$(jq -n \
    --arg profile "$ENV_KEY" \
    '[
      {type:"mrkdwn", text: ("*Perfil EAS:*\n" + $profile)},
      {type:"mrkdwn", text: "*Plataforma:*\nAndroid APK"}
    ]')
fi

# Bloque de instalación: link directo + QR
INSTALL_BLOCK='[]'
if [ -n "$INSTALL_URL" ]; then
  QR_IMAGE_URL=$(jq -rn --arg u "$INSTALL_URL" '"https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=" + ($u|@uri)')
  INSTALL_BLOCK=$(jq -n \
    --arg apk "$INSTALL_URL" \
    --arg build "$BUILD_PAGE_URL" \
    --arg qr "$QR_IMAGE_URL" \
    '[
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ("*:iphone: Instalar " + (if $build != "" then "<" + $build + "|ver en Expo>" else "APK" end) + "*\n" +
                 ":point_right: *<" + $apk + "|Descargar APK directo>*")
        }
      },
      {
        type: "image",
        title: {type: "plain_text", text: "QR instalación Android", emoji: true},
        image_url: $qr,
        alt_text: "QR para descargar el APK"
      }
    ]')
elif [ -n "$BUILD_PAGE_URL" ]; then
  INSTALL_BLOCK=$(jq -n --arg build "$BUILD_PAGE_URL" '[{
    type: "section",
    text: {type: "mrkdwn", text: ("*:warning: Sin link directo de APK.* Abrí <" + $build + "|el build en Expo> para ver QR y descarga.")}
  }]')
else
  INSTALL_BLOCK=$(jq -n --arg profile "$ENV_KEY" '[{
    type: "section",
    text: {type: "mrkdwn", text: ("*:warning: No hay APK publicado para `" + $profile + "`.*\nGenerá uno: GitHub Actions → *EAS Android Build* → perfil `" + $profile + "`.")}
  }]')
fi

BUTTONS='[]'
BUTTONS=$(jq -n \
  --arg expo "${EXPO_URL:-}" \
  --arg build "${BUILD_PAGE_URL:-}" \
  --arg apk "${INSTALL_URL:-}" \
  --arg run "${RUN_URL:-}" \
  --arg cta "$CTA_LABEL" \
  '[
    (if $apk != "" then {type:"button", text:{type:"plain_text", text:"Descargar APK"}, url:$apk, style:"primary"} else empty end),
    (if $build != "" then {type:"button", text:{type:"plain_text", text:"Ver QR en Expo"}, url:$build} else empty end),
    (if $expo != "" then {type:"button", text:{type:"plain_text", text:$cta}, url:$expo} else empty end),
    (if $run != "" then {type:"button", text:{type:"plain_text", text:"Ver workflow"}, url:$run} else empty end)
  ]')

PAYLOAD=$(jq -n \
  --arg title "$TITLE" \
  --arg body "$BODY" \
  --arg commit "$COMMIT_LINE" \
  --arg color "$COLOR" \
  --argjson fields "$FIELDS_JSON" \
  --argjson buttons "$BUTTONS" \
  --argjson install "$INSTALL_BLOCK" \
  '{
    attachments: [{
      color: $color,
      blocks: (
        [
          {type:"header", text:{type:"plain_text", text:$title, emoji:true}},
          {type:"section", fields:$fields},
          {type:"section", text:{type:"mrkdwn", text:$commit}},
          {type:"section", text:{type:"mrkdwn", text:$body}}
        ]
        + $install
        + (if ($buttons | length) > 0 then [{type:"actions", elements:$buttons}] else [] end)
      )
    }]
  }')

curl -sf -X POST -H 'Content-type: application/json' -d "$PAYLOAD" "$SLACK_WEBHOOK_URL"

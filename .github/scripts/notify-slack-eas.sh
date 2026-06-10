#!/usr/bin/env bash
# Envía aviso a Slack vía Incoming Webhook.
# Uso: notify-slack-eas.sh <ota|build> <production|develop|demo> [opciones env]
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
  BODY="La app instalada con canal *${CHANNEL}* recibirá el update al abrirla (no hace falta nuevo QR)."
  CTA_LABEL="Ver updates en Expo"
else
  TITLE="${ENV_EMOJI} ${ENV_LABEL} — build Android listo"
  BODY="Abrí el link de Expo para ver el *QR de instalación* y descargar el APK."
  CTA_LABEL="Ver build en Expo (QR)"
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

BUTTONS='[]'
if [ -n "$EXPO_URL" ]; then
  BUTTONS=$(jq -n \
    --arg expo "$EXPO_URL" \
    --arg run "$RUN_URL" \
    --arg cta "$CTA_LABEL" \
    '[
      {type:"button", text:{type:"plain_text", text:$cta}, url:$expo},
      (if $run != "" then {type:"button", text:{type:"plain_text", text:"Ver workflow"}, url:$run} else empty end)
    ]')
fi

INSTALL_BLOCK='[]'
if [ -n "$INSTALL_URL" ]; then
  INSTALL_BLOCK=$(jq -n --arg url "$INSTALL_URL" '[{
    type: "section",
    text: {type: "mrkdwn", text: ("*Descarga directa APK:* <" + $url + "|Abrir enlace>")}
  }]')
fi

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

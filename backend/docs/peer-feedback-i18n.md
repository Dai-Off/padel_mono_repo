# Coach IA — peer feedback multiidioma

## Qué cambió

- `GET /players/:id/last-peer-feedback-insight` acepta idioma opcional (`?lang=` o `Accept-Language`).
- Sin idioma → **`es`** (igual que antes).
- OpenAI genera `recommendation_ia`, `fortalezas` y `a_mejorar` en ese idioma (prompt en `src/lib/peerFeedbackLanguage.ts`).
- Si OpenAI falla → plantillas en **español** (fallback histórico).
- La respuesta incluye `locale`.
- El cliente puede enviar `?lang=` o `Accept-Language` (mobile aún sin cablear en develop).

## Uso

```bash
# Default español
GET /players/{id}/last-peer-feedback-insight

# Idioma explícito
GET /players/{id}/last-peer-feedback-insight?lang=zh-HK
GET /players/{id}/last-peer-feedback-insight?lang=en
```

Locales con prompt dedicado: `es`, `en`, `zh-HK`. Otros BCP-47 usan prompt genérico.

**Auth:** `Authorization: Bearer <token>` obligatorio. Solo el propio jugador puede consultar su `id`.

## Tests

| Fecha | `lang` | Player ID | `insight_source` | `locale` | Notas |
|-------|--------|-----------|------------------|----------|-------|
| 2026-06-10 | `es` | `064fdbf9-…` | `openai` | `es` | Texto en español OK |
| 2026-06-10 | `zh-HK` | `064fdbf9-…` | `openai` | `zh-HK` | Texto en 繁體 OK |
| 2026-06-10 | `es` | `a463c9a3-…` (Martin) | — | `es` | `empty: true` (sin feedback en DB) |
| | `en` | | | | Pendiente |

# Flujo Jugador -> Unirse a Torneo

Guia rapida para probar como un usuario se registra, completa onboarding y se une a torneos (publicos o privados).

## 1) Registro y login del jugador

### Registro
`POST /auth/register`

Body:
```json
{
  "email": "jugador_demo@padel.local",
  "password": "123456",
  "name": "Jugador Demo"
}
```

### Login
`POST /auth/login`

Body:
```json
{
  "email": "jugador_demo@padel.local",
  "password": "123456"
}
```

Guardar `session.access_token` para los siguientes pasos (`Authorization: Bearer <token>`).

## 2) Onboarding de jugador (nivelacion inicial)

`POST /players/onboarding`

Headers:
- `Authorization: Bearer <access_token>`

Body de ejemplo:
```json
{
  "answers": [
    { "question_id": "experience_years", "value": 3 },
    { "question_id": "weekly_frequency", "value": 2 },
    { "question_id": "competition_level", "value": "intermedio" },
    { "question_id": "physical_condition", "value": "media" },
    { "question_id": "stroke_consistency", "value": "media" }
  ]
}
```

Si faltan respuestas, la API responde `next_question`.

## 3) Ver torneos publicos

`GET /tournaments/public/list?club_id=<club_uuid>`

No requiere invitacion para listar.

## 4) Unirse a torneo publico

`POST /tournaments/{id}/join`

Headers:
- `Authorization: Bearer <access_token>`

Resultado:
- si hay cupo, se crea inscripcion confirmada;
- el chat del torneo recibe mensaje del sistema:
  `"Nombre Apellido se ha unido al torneo."`

## 5) Unirse a torneo privado (invitacion/url)

Para torneo privado se usa el enlace/token de invitacion.

### 5.1 Generar invitacion (owner/club)
`POST /tournaments/{id}/invites`

Body:
```json
{
  "invites": [
    { "email_1": "jugador_demo@padel.local" }
  ]
}
```

La respuesta incluye `invite_urls` para compartir por WhatsApp.

### 5.2 Aceptar invitacion por token
`POST /tournaments/invites/{token}/accept`

Body:
```json
{
  "email": "jugador_demo@padel.local"
}
```

Si el jugador no existe, se crea como guest/player temporal.

## 6) Chat del torneo (owner/jugador con acceso)

### Listar mensajes
`GET /tournaments/{id}/chat`

### Enviar mensaje
`POST /tournaments/{id}/chat`

Body:
```json
{
  "message": "Hola equipo, nos vemos 15 min antes."
}
```


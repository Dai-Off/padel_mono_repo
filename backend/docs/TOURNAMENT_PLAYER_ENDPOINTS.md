# Endpoints Torneos (Flujo Jugador)

Base URL: `http://localhost:3000`  
Auth: `Authorization: Bearer <access_token>` cuando aplica.

Invitaciones: `invite_url` apunta al backend (ejemplo: `http://localhost:3000/tournaments/invites/{token}/accept?...`) para aceptar directo desde Postman. Puedes sobreescribir base con `TOURNAMENT_INVITE_BASE_URL` o `BACKEND_PUBLIC_URL`.

## 1) Listar torneos públicos

- `GET /tournaments/public/list`
- Query opcional: `club_id=<uuid>`
- Uso: explorar torneos visibles para cualquier jugador.

Respuesta ejemplo:
```json
{
  "ok": true,
  "tournaments": [
    {
      "id": "uuid",
      "club_id": "uuid",
      "start_at": "2026-04-10T18:00:00.000Z",
      "end_at": "2026-04-10T20:00:00.000Z",
      "price_cents": 1500,
      "prize_total_cents": 70000,
      "prizes": [
        { "label": "Campeón", "amount_cents": 40000 },
        { "label": "Subcampeón", "amount_cents": 20000 }
      ],
      "description": "Torneo mixto",
      "normas": "Llegar 15 minutos antes",
      "gender": null,
      "status": "open"
    }
  ]
}
```

## 2) Ver detalle de torneo como jugador

- `GET /tournaments/{id}/player-detail` (requiere token)
- Regla de acceso:
  - torneo público: permitido
  - torneo privado: solo si ya participas (`my_inscription` existe)

Respuesta ejemplo:
```json
{
  "ok": true,
  "tournament": { "id": "uuid", "description": "..." },
  "counts": { "confirmed": 8, "pending": 2 },
  "my_inscription": { "id": "uuid", "status": "confirmed" }
}
```

## 3) Inscribirse (jugador individual)

- `POST /tournaments/{id}/join` (requiere token)
- Solo para torneos públicos y abiertos.
- Valida cupo, Elo y categoría de género (si el torneo la define).

Body: sin body.

## 4) Inscribirse como pareja

- `POST /tournaments/{id}/join-pair` (requiere token)
- Solo para torneos públicos, abiertos y `registration_mode = pair`.
- El jugador queda como `player_id_1` y se crea invitación para `teammate_email`.

Body:
```json
{
  "teammate_email": "pareja@padel.local"
}
```

Respuesta:
```json
{
  "ok": true,
  "status": "pending",
  "invite_url": "http://localhost:3000/tournaments/invites/<token>/accept?tournament_id=..."
}
```

## 5) Aceptar invitación (pareja o invitación general)

- `POST /tournaments/invites/{token}/accept`
- No requiere bearer, usa token + email.
- Valida expiración, cupo, Elo y género del torneo.

Body:
```json
{
  "email": "pareja@padel.local",
  "first_name": "Nombre",
  "last_name": "Apellido"
}
```

## 6) Bajarse del torneo como jugador

- `POST /tournaments/{id}/leave` (requiere token)
- Cancela la inscripción activa del jugador (`pending` o `confirmed`).
- Reglas de bloqueo:
  - si pasó `cancellation_cutoff_at`, no deja
  - si el torneo ya empezó, no deja

Body: sin body.

## 7) Chat de torneo (jugador)

### Listar mensajes
- `GET /tournaments/{id}/chat/player` (requiere token)
- Acceso: torneo público o estar inscrito.

### Enviar mensaje
- `POST /tournaments/{id}/chat/player` (requiere token)

Body:
```json
{
  "message": "Nos vemos 15 min antes"
}
```

## 8) Campos relevantes nuevos en torneos

- `description`: descripción general.
- `normas`: reglas/normas del torneo (nuevo).
- `prizes`: array dinámico por puesto.
- `prize_total_cents`: suma de premios (si envías `prizes`, el backend lo recalcula).
- `gender`:
  - `null`: sin restricción por género
  - `male` / `female`: restringe por género de perfil
  - `mixed`: categoría explícita mixta (sin filtro por género)

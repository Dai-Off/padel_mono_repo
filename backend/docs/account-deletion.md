# Eliminación de cuenta (GDPR / PIPL)

Flujo de **soft-delete + anonimización** para jugadores de la app móvil. La identidad vive en `public.players` (perfil) y `auth.users` (Supabase Auth); no hay tabla `users` separada.

## Flujo

```
1. POST /account/delete          → status = pending_deletion, deletion_requested_at = now()
2. Período de gracia (14 días por defecto)
   - El usuario puede cancelar con POST /account/cancel-deletion
   - O iniciando sesión de nuevo (auto-cancel en POST /auth/login)
3. Job diario (03:00 UTC)       → anonymizePlayer() vía Supabase RPC + Auth Admin API
4. status = deleted, deleted_at = now(), PII sobrescrita
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/account/delete` | Bearer | Solicita borrado |
| POST | `/account/cancel-deletion` | Bearer | Cancela solicitud pendiente |
| POST | `/account/process-deletions` | `x-cron-secret` | Ejecuta el job (alternativa al cron interno) |

## Configuración

Variables en `backend/.env`:

```env
# Días de gracia antes de anonimizar (default: 14)
ACCOUNT_DELETION_GRACE_DAYS=14

# Secreto para POST /account/process-deletions (recomendado en prod)
CRON_SECRET=...

# Desactivar cron embebido en el servidor (default: activo)
# ACCOUNT_DELETION_CRON=0
```

## Migración

```bash
cd backend
npm run account-deletion:migrate
# o aplicar manualmente backend/db/087_account_deletion.sql en Supabase SQL Editor
```

## Job manual

```bash
cd backend
npm run jobs:account-deletion
```

## Tablas anonimizadas

| Tabla | Campos |
|-------|--------|
| `players` | email, nombre, teléfono, username, bio, avatar, stripe_customer_id, etc. |
| `player_direct_messages` | body |
| `club_reviews` | comment |
| `match_feedback` | comment, would_not_repeat_reason |
| `onboarding_answers` | answers |
| `tournament_chat_messages` | author_name, message (por auth_user_id) |
| `booking_chat_messages` | author_name, message (por auth_user_id) |
| `community_posts` / `community_comments` | caption, content (si existen) |
| `coach_assessments` | answers (si existe) |
| `auth.users` (Supabase) | email, phone, metadata; usuario baneado |

## Tablas conservadas (obligación legal/fiscal)

Se mantiene `player_id` pero sin PII reconocible en el perfil:

- `payment_transactions`, `store_orders`, `store_order_items`, `wallet_transactions`
- `bookings`, `booking_participants`, `matches`, `match_players`, `score_submissions`
- Historial de ligas, learning logs, movimientos de inventario

## Auditoría

`deletion_log`: eventos `request`, `cancel`, `completed`, `failed` — sin PII, solo IDs y timestamps.

## Errores

Si la RPC `anonymize_player` falla, Postgres hace **rollback completo** y se registra `event_type = failed` para reintento al día siguiente. El job usa solo `SUPABASE_SERVICE_ROLE_KEY` (sin conexión Postgres directa).

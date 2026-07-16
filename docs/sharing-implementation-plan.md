# Sistema de Compartir — Plan de implementación

> **Implementado (2026-07).** Se conserva como referencia de diseño; la fuente
> de verdad es el código y las migraciones.
> Fecha: 2026-07-07
> **Pieza central:** compartir un partido — público o privado — para que la gente **se una**. Cualquier persona con el link puede sumarse, aunque no esté invitada in-app: *"se le mandó el link, así que ya se le invitó"*.
> Relación: habilita la misión D12 y futuras misiones de share del Season Pass (`docs/season-pass-implementation-plan.md`); complementa el sistema de follows (`docs/follow-system-implementation-plan.md`). Ambos se implementan **antes** que el pase.

---

## 1. Contexto y prioridad

Dos capas, por orden de importancia (decidido 2026-07-07):

1. **Compartir partido para reclutar** (la prioridad): el link de un partido funciona como **invitación al portador**. Sirve para llenar partidos — el caso de uso real de "faltan 2 para el sábado" — tanto en partidos públicos como privados.
2. **Compartir para presumir/comunicar** (segunda capa): resultados de partidos, logros, hitos del pase y torneos como posts estructurados en el feed; repost de posts de otros; share externo con imagen de marca.

---

## 2. Estado actual relevante

- **Ya existe un sistema de invitación por link con token** para partidos privados: `match_invites` (`backend/db/089_match_invites.sql` + `090_match_invites_flexible.sql`) — invitaciones **por email** con `token_hash` único + `invite_url`, expiración, estados (`pending/accepted/rejected/expired/cancelled`), y desde la 090 **la plaza la elige el invitado al pagar**.
- **Endpoints completos** en `backend/src/routes/matchInvites.ts`: bandeja (`GET /matches/invites/received`), accept/reject por invite (`POST /invites/inbox/:inviteId/accept|reject`), **aceptación por token** (`GET/POST /invites/:token/accept`, con landing HTML legacy), y gestión del organizador (listar, crear in-app, reenviar, revocar). Lifecycle en `backend/src/lib/matchInviteLifecycle.ts` y `matchInviteAccess.ts`.
- **Partidos privados**: open match con `visibility private` (referencias en `matches.ts`, `payments.ts`).
- **Feed de comunidad**: `POST /community/posts` (multer + moderación Sightengine), likes, comentarios, bookmarks, reports. Las share cards heredan toda esa mecánica.
- ⚠️ **El `CREATE TABLE` base de las tablas `community_*` no está versionado** en `backend/db/` (se crearon directo en Supabase); solo existen alters (`075`, `076`). Primer paso obligado antes de alterarlas: versionar el esquema base.
- **Deep links**: `expo-linking` ya se usa (recovery de password, invitaciones a torneos).

**Conclusión clave:** el join por link no se construye desde cero — es la **generalización** del sistema de invitaciones existente: de link **nominal** (una persona, un email, un solo uso) a link **al portador** (multiuso, autoriza a quien lo tenga).

---

## 3. Pieza central — el join link de partido

### 3.1 Concepto

- Un partido tiene **un link para compartir** que cualquiera puede canjear para unirse, hasta llenar plazas.
- **Partido público:** el link es un atajo al detalle con CTA "Unirse".
- **Partido privado:** el link **ES la autorización** — poseerlo equivale a estar invitado, sin necesidad de invitación nominal ni aprobación del organizador (decidido 2026-07-07).

### 3.2 Modelo de datos — `0XX_match_join_links.sql`

```sql
create table if not exists public.match_join_links (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  created_by_player_id uuid not null references public.players(id) on delete cascade,
  token_hash text not null unique,      -- solo el hash, como en match_invites
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (match_id)                     -- un link activo por partido (regenerable revocando)
);
```

- Token aleatorio opaco no enumerable (mismo patrón `token_hash` de `match_invites`); en DB solo se guarda el hash.
- **Validez implícita**: el link vale hasta que el partido empiece, se llene o se cancele — no necesita `expires_at` propio.
- **Revocación**: el organizador puede revocar y regenerar (invalida el link anterior). Útil si el link se descontrola.

### 3.3 Flujo de unirse

1. **Compartir**: desde el detalle del partido, cualquier participante toca "Invitar por link" → el backend crea (o devuelve el existente) el join link → share sheet nativa con **texto de plantilla + link** ("🎾 Únete a mi partido el sábado 19:00 en {club} — {link}").
2. **Abrir**: el receptor con la app instalada abre el deep link → la app resuelve el token (`GET /matches/join-link/:token`) → detalle del partido en "modo invitado por link": info completa + plazas libres + CTA **"Unirse"**.
3. **Unirse** (`POST /matches/join-link/:token/join`): misma mecánica que aceptar una invitación (090) — **elige plaza/equipo y paga si la reserva lo exige**. Implementación con máxima reutilización: materializar el canje como un `match_invite` auto-creado y aceptado (`invited_by` = creador del link) para heredar todo el lifecycle de invitaciones y pagos, en vez de un alta paralela en `match_players`.
4. **Sin app**: no ve nada (decisión previa: sin universal links ni landing web). El texto de la plantilla debe dar el contexto por sí solo para que quien no tiene la app entienda qué es y se la instale si quiere.
5. **Guards del join**: partido no empezado ni cancelado, plaza libre (máx. 4), no estar ya dentro, link no revocado. Si está lleno → estado "partido completo" (con sugerencia de seguir al organizador — cross-sell con follows).

### 3.4 El join link también vive en el feed

- La `UpcomingMatchShareCard` (partido no jugado compartido al feed) lleva **CTA "Unirse" directo**: si el partido es público basta con el id; si es privado, el post lleva embebida la autorización del join link.
- Esto convierte el feed de comunidad en tablón de reclutamiento — el uso más valioso del share interno.

### 3.5 Seguridad y riesgos asumidos

- Token opaco, no enumerable, solo hash en DB. Nunca exponer el match_id como autorización de un privado.
- **Riesgo asumido por producto**: quien reenvía el link extiende la invitación en cadena. Es la semántica deseada ("ya se le invitó"). La red de seguridad es la revocación + los guards de plazas.
- Rate limit ligero en el canje (higiene anti-abuso, patrón cooldown en memoria del repo).

---

## 4. Compartir al feed (share cards)

Decisiones ya cerradas (2026-07-07): se puede compartir al feed **partidos (finalizados y próximos), logros/títulos/insignias, hitos del Season Pass y torneos**; en un partido compartido **se muestran todos los jugadores** (el resultado ya es semi-público en perfiles).

### 4.1 Modelo de datos — `0XX_community_shared_posts.sql`

```sql
alter table public.community_posts
  add column if not exists shared_type text
    check (shared_type in ('match','unlockable','season_pass','tournament','post')),
  add column if not exists shared_id uuid,
  add column if not exists shared_meta jsonb not null default '{}'::jsonb;

create index if not exists idx_community_posts_shared
  on public.community_posts (shared_type, shared_id) where shared_type is not null;
```

- **`shared_meta` = snapshot en el momento de compartir** (marcador, jugadores con avatar, club, rareza del logro, nivel del pase…). Render estable sin N+1 joins; el post sobrevive aunque la entidad cambie. `shared_id` queda para la navegación al tap.
- El snapshot lo construye **el backend** (no se confía en el cliente): valida que la entidad existe y que el jugador tiene derecho a compartirla.
- **Repost** = `shared_type='post'` + `shared_id` del original. Reglas v1 (cerradas): no se repostea un repost (siempre el original), **no** se repostean posts propios, las stories no se repostean, y el original muestra **contador de reposts** (count sobre `idx_community_posts_shared`, incluido en los selects del feed).

### 4.2 Validaciones por tipo (al crear el post)

- `match`: el jugador está en `match_players`. Finalizado → card de resultado; próximo → card de reclutamiento con CTA "Unirse" (§3.4). `shared_meta.match_status` distingue el render (snapshot: la card no muta; el tap lleva al detalle actualizado).
- `unlockable`: existe fila en `player_unlockables` del jugador.
- `tournament`: inscrito/participante.
- `season_pass`: hito verificable en `player_season_pass` (se activa cuando llegue el pase).
- `post`: el original existe, no es story, no es repost, no es propio.

### 4.3 Backend

- Extender `POST /community/posts`: además de media, acepta `{ shared_type, shared_id, text? }`. Con `shared_type`, la media es opcional; el backend valida, construye `shared_meta` y registra el share event.
- Los GET del feed incluyen `shared_type / shared_id / shared_meta` (+ `repost_count`) en los selects existentes.

---

## 5. Share externo (imagen + texto)

Decisiones cerradas (2026-07-07):

- **Imagen + texto, nunca solo un link**: la imagen con branding + un **texto de plantilla por tipo** ("🎾 Gané 6-4 / 7-5 en {club} — ¿te atreves? {link}") + scheme link.
- **Sin universal links ni landing web**: quien no tiene la app no ve el contenido; el link solo abre la app instalada.
- **Generación de imagen en el cliente**: tarjeta con branding renderizada offscreen y capturada con `react-native-view-shot` → PNG → share sheet (`Share` / `expo-sharing`). Cero infraestructura de servidor.
- Para **partidos próximos**, el texto/imagen externos incorporan el **join link** (§3) — es el mismo gesto de compartir, con superpoder de reclutamiento.

---

## 6. Registro de shares y conexión con el Season Pass

**`0XX_community_share_events.sql`** — registro de TODOS los actos de compartir, para misiones y analítica:

```sql
create table public.community_share_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  share_type text not null check (share_type in ('match','unlockable','season_pass','tournament','post')),
  ref_id uuid,
  channel text not null check (channel in ('feed','repost','external','join_link')),
  created_at timestamptz not null default now()
);
create index idx_share_events_player_time
  on public.community_share_events (player_id, created_at desc);
```

- Misión **D12**: `condition_key = 'share_external'` → cuenta eventos con `channel in ('external','join_link')` en el período (compartir el link de tu partido por WhatsApp ya cuenta).
- Misiones futuras del pool data-driven: "Comparte un partido en el feed", "Haz un repost", "Comparte un logro", "Llena un partido por link" (canjes de tu join link).
- Como follows y lección: los endpoints de compartir devuelven el bloque `season_pass` en la respuesta (canal instantáneo, §6.7 del plan del pase).
- Matiz Android: la API nativa de share no siempre confirma si el usuario completó el envío → v1 registra la apertura del share sheet (limitación conocida y asumida).

---

## 7. Mobile

### 7.1 Share cards en el feed

`PostCard.tsx` delega por `shared_type`:

| Card | Contenido |
|---|---|
| `UpcomingMatchShareCard` | **La estrella**: partido no jugado — fecha/hora, club, jugadores, plazas libres y **CTA "Unirse"** (§3.4) |
| `MatchShareCard` | Partido finalizado: marcador por sets, 4 jugadores con avatar+marco (`AvatarWithFrame`), club y fecha. Tap → detalle |
| `UnlockableShareCard` | Logro/título/insignia con render procedural por rareza (reutilizar `rarity.ts`/`frames.ts` y el estilo de `UnlockModal`) |
| `SeasonPassShareCard` | Nivel/recompensa/racha (se activa con el pase; queda especificada) |
| `TournamentShareCard` | Torneo + resultado/posición |
| `RepostCard` | Post original embebido + "Compartido por {name}"; el original muestra contador de reposts |

Composer: texto opcional encima de la card.

### 7.2 Puntos de entrada

| Desde | Acción |
|---|---|
| Detalle de partido (`PartidoDetailScreen`) | Botón "Compartir" → sheet: **"Invitar por link"** (§3) / "Al feed" / "Externo" |
| Deep link de join recibido | Abre detalle del partido en modo invitado + CTA "Unirse" (registro del handler en `App.tsx` junto a los deep links existentes) |
| Modal de desbloqueo (`UnlockModal`) | Botón "Compartir logro" |
| Modal de level-up del pase (cuando exista) | Botón "Compartir" |
| Detalle de torneo | Botón "Compartir" |
| `PostCard` de otros usuarios | Menú: "Repostear" / "Compartir enlace" |

### 7.3 i18n

Nuevas strings en **es + zh-HK**: "Compartir", "Invitar por link", "Unirse", "Partido completo", "Compartir al feed", "Repostear", "Compartido por {name}", plantillas de texto externo por tipo.

---

## 8. Fases

- **F1 — Join link de partido (la prioridad):** migración `match_join_links` + endpoints (crear/resolver/canjear, reutilizando el lifecycle de `match_invites` y su flujo de pago) + handler de deep link + botón "Invitar por link" en el detalle del partido + tabla `community_share_events` (el tracking de D12 nace aquí). Funciona para públicos y privados.
- **F2 — Partidos al feed + repost:** versionado del esquema base de comunidad + columnas `shared_*` + `UpcomingMatchShareCard` (con CTA Unirse) + `MatchShareCard` + `RepostCard` con contador + extensión de `POST /community/posts`.
- **F3 — Imagen de marca + logros/torneos:** tarjeta con branding + view-shot para el share externo, `UnlockableShareCard` + botón en `UnlockModal`, `TournamentShareCard`. La `SeasonPassShareCard` se activa con el pase.

---

## 9. Orden de implementación conjunto (con follows, antes del Season Pass)

1. **Compartir F1** (join link) — la prioridad de producto; independiente de follows.
2. **Follows F1** (botón, contadores, listas, buscador) → activa la misión D10. *(1 y 2 pueden ir en paralelo — no comparten código.)*
3. **Compartir F2** (feed cards + repost) → habilita misiones de "comparte en el feed" y alimenta D11 (comentarios).
4. **Follows F2** (sugerencias + feed personalizado, ver plan de follows §11) y **Compartir F3** — pueden solaparse con el desarrollo del pase.
5. **Season Pass** fases 1–3 (`docs/season-pass-implementation-plan.md`) con D10/D11/D12 nacidas activas.

---

## 10. Decisiones

### Cerradas (2026-07-07)

1. **Join por link universal**: cualquier persona con el link puede unirse a un partido, **incluso privado**, sin invitación nominal ni aprobación — el link es la invitación.
2. **Partidos no jugados: SÍ** se comparten, con card propia distinta a la de resultado (y CTA "Unirse").
3. **Repost de posts propios: NO. Contador de reposts en el original: SÍ**, desde v1.
4. **Universal links / landing web: NO** — sin la app no se ve el contenido; el link es scheme-only.
5. **El share externo siempre lleva imagen + texto por plantilla**, nunca solo un link.
6. En un partido compartido **se muestran todos los jugadores**.
7. "Compartir posts" de otros = repost al feed + enlace externo (sin envío por DM en v1).

### Abiertas (menores, con propuesta)

1. ¿Quién puede generar el join link — cualquier participante del partido o solo el organizador? (propuesta: **cualquier participante**; la revocación queda en manos del organizador).
2. Al unirse por link a un partido con pago pendiente, confirmar que el flujo 090 (plaza al pagar) cubre todos los casos de reserva (wallet, bonos de clase, etc.).
3. ¿Un canje de join link debería notificar al organizador? (hoy no hay centro de notificaciones — como mucho, el partido actualizado en su lista).

---

## 11. Edge cases y QA

- **Link de partido lleno / empezado / cancelado / revocado** → estados claros en la pantalla de join, nunca error crudo.
- **Canje concurrente de la última plaza** → resolver en DB (unique/checks del alta), el perdedor ve "partido completo".
- **El que canjea ya está en el partido** → abrir detalle normal, sin CTA.
- **Token inválido/corrupto** → pantalla de link no válido.
- **Privado sin link** → el detalle no debe ser accesible por match_id para no-invitados (verificar el gating actual de `visibility private` al añadir la ruta de resolución).
- **Moderación**: los share cards son contenido de comunidad — heredan report (`community_reports`) y borrado propio.
- **i18n zh-HK** completo; **type-check** backend y mobile (`npx tsc --noEmit`).

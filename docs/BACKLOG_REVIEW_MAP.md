# Mapeo backlog → código + rutas para revisión manual

Documento de referencia para revisar en **web-app** (portal club), **mobile-app** y **backend** los temas acordados (personal/roles, precios/online, pagos/caja, partidos móvil, bonos/wallet, tipos de cliente).

Convención URLs web (Vite dev): `http://localhost:5173` + path indicado.

---

## 1. Personal: horario al crear usuario de gestión

| Área | Qué revisar |
|------|-------------|
| **Web — ruta** | `/personal` → pestaña **Personal** dentro de `ClubDashboard` |
| **Web — componentes** | `web-app/src/components/Staff/ClubStaffTab.tsx` (formulario `schedule_blocks`) |
| **Web — servicio** | `web-app/src/services/clubStaff.ts` |
| **Backend — API** | `GET/POST/PUT/DELETE /club-staff` → `backend/src/routes/clubStaff.ts` |

**Estado actual:** El horario es **informativo** (turnos); no limita login ni menú.

---

## 2. Roles recepción / admin / profesor y ocultar menús

Hay **dos capas** distintas hoy:

| Capa | Web — ruta | Archivos clave |
|------|------------|----------------|
| **Ficha personal** (texto “rol”, sin permisos) | `/personal` | `ClubStaffTab.tsx`, campo `role` + `STAFF_ROLE_OPTIONS` |
| **Permisos reales del portal** | `/equipo-portal` (“Gestión de personal” en menú) | `ClubPortalRolesView.tsx` → `ClubPortalRolesTab.tsx` |
| **Qué ve cada rol en el menú** | Cualquier ruta con sesión staff | `web-app/src/hooks/usePortalMenuPermissions.ts`, `web-app/src/lib/portalNavPermissions.ts` |
| **Backend — permisos canónicos** | — | `backend/src/lib/portalPermissions.ts` |
| **Backend — miembros portal** | — | `backend/src/routes/clubPortal*.ts` (montado en `/club-portal` en `backend/src/routes/index.ts`) |
| **Auth context** | — | `backend/src/middleware/attachAuthContext.ts` (`portalMemberships`) |

**Backlog:** Unificar UX si se quiere que **Personal** asigne plantillas recepción/admin/profe **conectadas** a estos permisos (hoy no están enlazados). **Mejora:** en `/personal` hay aviso con enlace explícito a `/equipo-portal`.

---

## 3. Precios por tipo de reserva + disponibilidad online

| Área | Qué revisar |
|------|-------------|
| **Web — ruta** | `/precios` → `PreciosView` |
| **Web — formulario** | `web-app/src/components/Precios/PreciosForm.tsx` |
| **Web — constantes tipos** | `web-app/src/services/reservationTypePrices.ts` (`RESERVATION_TYPES`) |
| **Backend — API** | `GET/PUT /reservation-type-prices` → `backend/src/routes/reservationTypePrices.ts` |
| **BD / evolución** | `053_reservation_type_allow_online.sql` → `reservation_type_prices.allow_online`; `054_courts_sport_and_player_segments.sql` → `courts.sport`, `club_player_segments`. Migración `052` (tipos dinámicos por club) sigue siendo evolución aparte. |
| **Público** | `GET /public/reservation-online?club_id=` |

**Hecho (revisar):** toggles **online** en `PreciosForm`; enforcement en `tariffs/slot-price`, `payments`, `matches` (`create-with-booking`). **Pendiente:** UI/API para `club_reservation_types` (052) si se quiere tipos totalmente dinámicos.

---

## 4. Pagos (listado tipo caja) vs cierre de caja

| Área | Qué revisar |
|------|-------------|
| **Web — ruta Pagos** | `/pagos` → `ClubPaymentsTab` (`web-app/src/components/Payments/ClubPayments.tsx`) |
| **Web — servicio** | `web-app/src/services/payments.ts` → `club-transactions`, etc. |
| **Web — ruta Cierre de caja** | `/cierreCaja` → `ClubCashClosingTab` (`web-app/src/components/CashClosing/ClubCashClosing.tsx`) |
| **Backend** | `backend/src/routes/paymentsRouter.ts` + handlers en `backend/src/routes/payments.ts` |

---

## 5. Móvil — Partidos: calendario / anterior-siguiente / histórico

| Área | Qué revisar |
|------|-------------|
| **Navegación** | Barra inferior → tab **Partidos** (`MainTabId` `'partidos'` en `mobile-app/src/components/layout/BottomNavbar.tsx`) |
| **Pantalla** | `mobile-app/src/screens/PartidosScreen.tsx` |
| **API** | `mobile-app/src/api/matches.ts` → `fetchMatches({ activeOnly, dateFrom, dateTo })` |
| **Backend listado** | `GET /matches` → `active_only`, `date_from`, `date_to`; orden por `bookings.start_at` cuando hay rango de fechas |

**Hecho:** barra día (prev/next, “Hoy”), vista día con `active_only=0` + rango; chips deporte / plazas / estado en `PartidosScreen.tsx`.

---

## 6. Móvil — Filtros de partidos (pista, pago, ocupación, estado, deporte)

| Área | Qué revisar |
|------|-------------|
| **Lista global partidos** | `PartidosScreen.tsx` (filtros deporte, plazas, estado; `courtSport` desde API) |
| **Partidos dentro de un club** | `mobile-app/src/screens/ClubDetailScreen.tsx` → tab **Partidos abiertos** (`loadClubPartidos`) |
| **Mapeo UI** | `mobile-app/src/api/mapMatchToPartido.ts` |

**Hecho:** deporte vía `courts.sport` + `mapMatchToPartido`. **Opcional:** filtros por método de pago / pista concreta si se exponen en el listado.

---

## 7. Bonos regalo + wallet + premio

| Área | Qué revisar |
|------|-------------|
| **Web — grilla (modales, no rutas propias)** | `http://localhost:5173/grilla` → menú lateral de grilla: **Bonos**, **Recarga wallet** (`web-app/src/features/grilla/GrillaView.tsx` importa `BonusManagement`, `WalletRecharge`) |
| **Bonos** | `web-app/src/features/grilla/components/BonusManagement.tsx` |
| **Recarga wallet + método Premio** | `web-app/src/features/grilla/components/WalletRecharge.tsx` (`paymentMethod === 'prize'`) |
| **Backend bonos** | `backend/src/routes/bonuses.ts` → `/bonuses`, `POST /bonuses/:id/gift-to-player` |
| **Pack clases** | `POST /class-bonos/purchase` → `backend/src/routes/classBonos.ts` |
| **Backend wallet** | `backend/src/routes/walletRouter.ts` (montado `/wallet` en `index.ts`) |

**Hecho:** regalo desde `BonusManagement` (UUID jugador; categoría clases → sesiones). Recarga **clases** en `WalletRecharge` (tabs).

---

## 8. Tipos de cliente (staff, admin, …) con descuento

| Área | Qué revisar |
|------|-------------|
| **Jugadores / CRM web** | `/jugadores`, `/crm` |
| **Backend** | `PUT /club-player-segments` → `backend/src/routes/clubPlayerSegments.ts`; `GET /club-clients` enriquece `segment_slug` + `discount_percent` |
| **Web CRM** | `ClubPlayers.tsx` — modal jugador: tipo + % descuento |

**Hecho:** segmento + descuento en listado y edición; `tariffs/slot-price` aplica descuento con `player_id`.

---

## 9. Reservas / partidos abiertos en móvil (contexto “solo ciertos tipos online”)

| Área | Qué revisar |
|------|-------------|
| **Reserva tras elegir pista** | `ClubDetailScreen.tsx`, flujos que llaman `createMatchWithBooking` / APIs en `mobile-app/src/api/matches.ts` |
| **Confirmación** | `mobile-app/src/screens/BookingConfirmationScreen.tsx` (ej. `reservationType: 'open_match'` en flujos concretos) |

Coordinado con §3 (`allow_online` + metadata Stripe / creación partido).

---

# Checklist rápida — dónde ir a mano

### Portal web (club)

- [ ] `/personal` — Alta personal, horario, etiqueta de rol (texto); aviso con enlace a `/equipo-portal`.
- [ ] `/equipo-portal` — Roles del portal, permisos que ocultan menú.
- [ ] `/precios` — Precios por tipo de reserva (tipos fijos).
- [ ] `/pagos` — Listado de transacciones/cobros.
- [ ] `/cierreCaja` — Cierre de caja (complementario a Pagos).
- [ ] `/grilla` — Modales **Bonos** y **Recarga wallet** (Premio / bonos).

### App móvil (jugador)

- [ ] Tab bar **Partidos** — Día / filtros / listado próximo o por fecha.
- [ ] Tab **Pistas** → entrar a un club → **Partidos abiertos** en detalle club.
- [ ] **Inicio** — Secciones próximos partidos / enlaces relacionados (`HomeScreen`, `ProximosPartidosSection`).
- [ ] Perfil / pagos jugador — `TusPagosScreen`, `TransaccionesScreen` (no son el portal club).

### Backend (Swagger / pruebas)

- [ ] `/club-staff`, `/club-portal/*`, `/reservation-type-prices`, `/public/reservation-online`, `/bonuses` (+ gift), `/class-bonos/purchase`, `/club-player-segments`, `/wallet`, `/payments/*`, `/matches` (query `date_from` / `date_to`)

---

*Última actualización: 2026-05-05 — revisar migraciones `053`/`054` en Supabase antes de usar segmentos, deporte de pista y `allow_online` en producción.*

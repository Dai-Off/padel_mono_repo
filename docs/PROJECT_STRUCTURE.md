# PROJECT_STRUCTURE.md — WeMatch Padel Monorepo

> Documento de referencia para desarrollo del módulo de aprendizaje.
> Generado: 2026-03-24

---

## ÍNDICE

1. [Estructura de Carpetas](#1-estructura-de-carpetas)
2. [Sistema de Navegación (mobile-app)](#2-sistema-de-navegación-mobile-app)
3. [Componentes Existentes](#3-componentes-existentes)
4. [Sistema de Estilos y Tema](#4-sistema-de-estilos-y-tema)
5. [Sistema de Internacionalización](#5-sistema-de-internacionalización)
6. [Conexión con Supabase](#6-conexión-con-supabase)
7. [Patrón de Usuario Autenticado](#7-patrón-de-usuario-autenticado)
8. [Estructura del Backend](#8-estructura-del-backend)
9. [Variables de Entorno](#9-variables-de-entorno)
10. [Patrones de Código](#10-patrones-de-código)
11. [Dependencias Relevantes](#11-dependencias-relevantes)
12. [Esquema de Base de Datos](#12-esquema-de-base-de-datos-inferido)
13. [Qué Existe vs. Qué Crear](#13-qué-existe-vs-qué-crear)

---

## 1. ESTRUCTURA DE CARPETAS

### Raíz del monorepo

```
padel_mono_repo/
├── mobile-app/          # App React Native (Expo)
├── web-app/             # Dashboard web React + Vite
├── backend/             # API REST Express + TypeScript
├── supabase/            # Funciones Supabase Edge
├── docs/                # Documentación del proyecto
├── README.md
└── CLAUDE.local.md
```

### mobile-app/src/

```
mobile-app/src/
├── api/                         # Funciones de fetch hacia el backend
│   ├── auth.ts                  # Login, registro, forgot password
│   ├── clubs.ts                 # Datos de clubes
│   ├── courts.ts                # Datos de pistas
│   ├── home.ts                  # Stats del home
│   ├── mapMatchToPartido.ts     # Transformador match → PartidoItem
│   ├── matches.ts               # Partidos (listar, crear, unirse)
│   ├── partidoClubs.ts          # Clubes de partidos
│   ├── payments.ts              # Pagos Stripe
│   ├── players.ts               # Perfil del jugador actual
│   └── search.ts                # Búsqueda de pistas disponibles
├── components/                  # Componentes reutilizables
│   ├── layout/                  # Estructura de pantalla
│   │   ├── AppHeader.tsx
│   │   ├── BackHeader.tsx
│   │   ├── BottomNavbar.tsx
│   │   ├── HamburgerButton.tsx
│   │   ├── MobileSidebar.tsx
│   │   ├── NavbarActions.tsx
│   │   ├── ScreenLayout.tsx
│   │   ├── SearchBarButton.tsx
│   │   └── SidebarContent.tsx
│   ├── partido/                 # Componentes de partidos
│   │   ├── BookingConfirmationModal.tsx
│   │   ├── ClubInfoSheet.tsx
│   │   ├── CrearPartidoLocationSheet.tsx
│   │   ├── PartidoCard.tsx
│   │   └── PartidoCardSkeleton.tsx
│   ├── search/                  # Componentes de búsqueda
│   │   ├── SearchCourtCard.tsx
│   │   ├── SearchCourtCardSkeleton.tsx
│   │   ├── SearchFilterBar.tsx
│   │   ├── SearchFiltersSheet.tsx
│   │   └── SearchResultsList.tsx
│   ├── ui/                      # Primitivos UI genéricos
│   │   └── Skeleton.tsx
│   └── SplashScreen.tsx
├── contexts/                    # React Contexts globales
│   ├── AuthContext.tsx           # Sesión del usuario
│   └── SidebarContext.tsx        # Estado del sidebar
├── hooks/                       # Custom hooks de datos
│   ├── useHomeStats.ts
│   ├── useMatchSearch.ts
│   ├── useOpenMatches.ts
│   ├── useSearchCourts.ts
│   └── useSidebar.ts
├── screens/                     # Pantallas principales
│   ├── ClubDetailScreen.tsx
│   ├── CompeticionesScreen.tsx
│   ├── HomeScreen.tsx
│   ├── LoginScreen.tsx
│   ├── MainApp.tsx              # Root con navegación por tabs
│   ├── MatchSearchScreen.tsx
│   ├── PartidoDetailScreen.tsx
│   ├── PartidoPrivadoDetailScreen.tsx
│   ├── PartidosScreen.tsx
│   ├── RegisterScreen.tsx
│   ├── TransaccionesScreen.tsx
│   └── TusPagosScreen.tsx
├── utils/                       # Utilidades varias
├── config.ts                    # API_URL, Stripe key
└── theme.ts                     # Spacing, fontSize, dimensiones
```

### web-app/src/

```
web-app/src/
├── components/
│   ├── Admin/          # Panel de administración
│   ├── Auth/           # Login, ForgotPassword, ResetPassword, EmailConfirmed
│   ├── Clubs/          # ClubCard, ClubForm
│   ├── Courts/         # CourtCard, CourtDetailModal, CourtForm, SortableCourtCard
│   ├── Common/         # TabSwitcher
│   ├── Dashboard/      # ClubDashboard (pantalla principal del manager)
│   ├── Inventory/      # InventoryControl
│   ├── Layout/         # Header, MainMenu, PageSpinner
│   ├── Onboarding/     # ManagerOnboarding
│   ├── Owners/         # OwnerCard, OwnerForm
│   ├── Players/        # ClubPlayers
│   ├── Precios/        # PreciosForm, PreciosView
│   ├── Registration/   # ClubRegistration, RegistroClubInvite
│   ├── School/         # ClubSchoolTab
│   ├── Settings/       # ClubSettings, ReservationTypePricesCard
│   └── Staff/          # ClubStaffTab
├── features/
│   └── grilla/         # Vista de grilla horaria (feature compleja)
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── i18n/       # i18n específico de grilla (es.ts, zh-HK.ts)
│       ├── utils/
│       └── GrillaView.tsx
├── locales/            # Traducciones globales
│   ├── en/files/ (common.json, courts.json)
│   ├── es/files/ (common.json, courts.json)
│   └── zh/
├── lib/
│   └── supabase.ts     # Cliente Supabase para web
└── App.tsx             # Router principal (React Router)
```

### backend/src/

```
backend/src/
├── routes/
│   ├── index.ts                  # Router principal (monta todos los subrouters)
│   ├── auth.ts                   # Registro, login, forgot-password, /me
│   ├── bookings.ts               # CRUD de reservas
│   ├── bookingParticipants.ts    # Participantes de reservas
│   ├── clubs.ts                  # CRUD de clubes
│   ├── clubApplications.ts       # Solicitudes de alta de club
│   ├── clubOwners.ts             # Propietarios de clubes
│   ├── clubStaff.ts              # Personal de clubes
│   ├── courts.ts                 # CRUD de pistas
│   ├── health.ts                 # Health check
│   ├── home.ts                   # Stats del home (zone trends)
│   ├── inventory.ts              # Gestión de inventario
│   ├── matches.ts                # CRUD de partidos
│   ├── matchPlayers.ts           # Jugadores en partidos
│   ├── payments.ts               # Stripe payment intents + webhook
│   ├── paymentsRouter.ts
│   ├── players.ts                # Perfiles de jugadores
│   ├── pricingRules.ts           # Reglas de precio dinámico
│   ├── privacyLogs.ts            # Logs de privacidad
│   ├── reservationTypePrices.ts  # Precios por tipo de reserva
│   ├── schoolCourses.ts          # Cursos de escuela
│   └── search.ts                 # Búsqueda de pistas disponibles
├── lib/
│   ├── env.ts
│   ├── inviteToken.ts
│   ├── mailer.ts
│   ├── payment/
│   ├── pricingRulesDefaults.ts
│   ├── staffPassword.ts
│   └── supabase.ts               # Clientes Supabase (service role, anon)
├── middleware/
│   ├── attachAuthContext.ts      # Extrae user del Bearer token
│   ├── requireAdmin.ts
│   └── requireClubOwnerOrAdmin.ts
├── app.ts
└── index.ts
```

---

## 2. SISTEMA DE NAVEGACIÓN (mobile-app)

**Patrón:** State-based navigation con `useState` — **NO usa React Navigation**.

### Arquitectura de navegación

```
App.tsx
└── AuthProvider
    └── SidebarProvider
        └── ScreenLayout (header + sidebar)
            └── MainApp.tsx  ← root de navegación
                ├── LoginScreen / RegisterScreen (si no autenticado)
                └── [Tabs] (si autenticado)
                    ├── Tab: 'inicio'    → HomeScreen
                    ├── Tab: 'reservar'  → MatchSearchScreen
                    │                       └── ClubDetailScreen (detailCourtId)
                    ├── Tab: 'competir'  → CompeticionesScreen
                    └── Tab: 'partidos'  → PartidosScreen
                                            ├── PartidoDetailScreen (selectedPartido)
                                            └── PartidoPrivadoDetailScreen (selectedPartido)
        └── Sidebar → TusPagosScreen → TransaccionesScreen
```

### Implementación en MainApp.tsx

```typescript
type TabId = 'inicio' | 'reservar' | 'competir' | 'partidos';

const [activeTab, setActiveTab] = useState<TabId>('inicio');
const [selectedPartido, setSelectedPartido] = useState<PartidoItem | null>(null);
const [detailCourtId, setDetailCourtId] = useState<string | null>(null);

// Renderizado condicional de pantalla activa
if (activeTab === 'inicio') return <HomeScreen onNavigateToTab={setActiveTab} />;
if (activeTab === 'reservar') {
  if (detailCourtId) return <ClubDetailScreen ... />;
  return <MatchSearchScreen onCourtPress={(c) => setDetailCourtId(c.club_id)} />;
}
```

### Bottom Navbar (tabs)

```typescript
// mobile-app/src/components/layout/BottomNavbar.tsx
const TABS: TabConfig[] = [
  { id: 'inicio',   label: 'Inicio',   icon: 'home' },
  { id: 'reservar', label: 'Reservar', icon: 'calendar' },
  { id: 'competir', label: 'Competir', icon: 'trophy' },
  { id: 'partidos', label: 'Partidos', icon: 'people' },
];
```

### Routing Web App (React Router)

```
/login                 → Login
/email-confirmed       → EmailConfirmed
/forgot-password       → ForgotPassword
/reset-password        → ResetPassword
/registro              → ClubRegistration
/registro-club         → RegistroClubInvite
/admin                 → AdminPanel (protegida)
/                      → ClubDashboard (protegida)
/jugadores             → ClubPlayers
/configuracion         → ClubSettings
/personal              → ClubStaffTab
/inventario            → InventoryControl
/escuela               → ClubSchoolTab
/onboarding            → ManagerOnboarding
/grilla                → GrillaView
/precios               → PreciosView
```

---

## 3. COMPONENTES EXISTENTES

### Layout

| Componente | Descripción |
|---|---|
| `ScreenLayout.tsx` | Wrapper raíz: header + contenido + sidebar. Usado en toda la app. |
| `AppHeader.tsx` | Header principal con botón hamburguesa + acciones derechas. |
| `BackHeader.tsx` | Header con flecha de retroceso y título. Usado en pantallas de detalle. |
| `BottomNavbar.tsx` | Barra de 4 tabs inferior (Inicio, Reservar, Competir, Partidos). |
| `MobileSidebar.tsx` | Drawer lateral deslizable con menú secundario. |
| `SidebarContent.tsx` | Contenido del sidebar: links a Tus Pagos, etc. |
| `HamburgerButton.tsx` | Botón de menú (3 líneas) que abre el sidebar. |
| `NavbarActions.tsx` | Iconos de acción en la derecha del header. |
| `SearchBarButton.tsx` | Botón que activa la barra de búsqueda. |

### Partido (Matches)

| Componente | Descripción |
|---|---|
| `PartidoCard.tsx` | Tarjeta de partido: fecha, jugadores con avatares/nivel, club, precio. Muestra estado público/privado. |
| `PartidoCardSkeleton.tsx` | Skeleton de carga para PartidoCard. |
| `BookingConfirmationModal.tsx` | Modal de confirmación de pago al unirse a un partido. |
| `ClubInfoSheet.tsx` | Bottom sheet con info del club (dirección, teléfono, etc.). |
| `CrearPartidoLocationSheet.tsx` | Bottom sheet para seleccionar ubicación al crear un partido. |

### Search (Búsqueda de Pistas)

| Componente | Descripción |
|---|---|
| `SearchCourtCard.tsx` | Tarjeta de resultado: pista con info, precio y slots horarios disponibles. |
| `SearchCourtCardSkeleton.tsx` | Skeleton de carga para SearchCourtCard. |
| `SearchFilterBar.tsx` | Barra de filtros activos (deporte, fecha, horario). |
| `SearchFiltersSheet.tsx` | Bottom sheet con opciones de filtro: interior/exterior, tipo de cristal, etc. |
| `SearchResultsList.tsx` | Lista contenedora de resultados de búsqueda. |

### UI Primitivos

| Componente | Descripción |
|---|---|
| `Skeleton.tsx` | Componente genérico de skeleton animado (placeholder de carga). |
| `SplashScreen.tsx` | Pantalla de splash inicial mientras carga la sesión (mínimo 2800ms). |

---

## 4. SISTEMA DE ESTILOS Y TEMA

### Archivo: `mobile-app/src/theme.ts`

```typescript
// Spacing — escala según ancho de pantalla (<360px usa factores reducidos)
export const theme = {
  spacing: {
    xs:  8,   // getSpacing(8)
    sm:  12,  // getSpacing(12)
    md:  16,  // getSpacing(16)
    lg:  20,  // getSpacing(20)
    xl:  24,  // getSpacing(24)
    xxl: 32,  // getSpacing(32)
  },
  fontSize: {
    xs:   12,  // scaleFont(12)
    sm:   14,  // scaleFont(14)
    base: 16,  // scaleFont(16)
    lg:   18,  // scaleFont(18)
    xl:   20,  // scaleFont(20)
    xxl:  28,  // scaleFont(28)
  },
  headerHeight:        56,
  headerPadding:       { paddingTop: 16, paddingBottom: 12 },
  scrollBottomPadding: 72,
  minTouchTarget:      44,  // Accesibilidad (Apple HIG)
  screenWidth:         SCREEN_WIDTH,
  screenHeight:        SCREEN_HEIGHT,
};
```

### Colores usados en componentes (sin archivo centralizado)

Los colores se usan inline en `StyleSheet.create()`. Valores recurrentes:

| Variable/Uso | Valor HEX | Dónde se usa |
|---|---|---|
| Brand primary (rojo) | `#E31E24` | Botones primarios, CTA, borde activo |
| Dark background | `#1a1a1a` | Headers, fondos oscuros |
| Dark background 2 | `#2a2a2a` | Gradientes |
| Text primary | `#1A1A1A` | Texto principal |
| Text secondary | `#6b7280` | Texto secundario, subtítulos |
| Text muted | `#9ca3af` | Texto inactivo, placeholders |
| Background light | `#f9fafb` | Fondos de pantalla |
| Background gray | `#f3f4f6` | Cards, inputs |
| Success green | `#10b981` | Estado exitoso |
| Link blue | `#2563eb` | Links, acciones secundarias |
| Border light | `#e5e7eb` | Bordes de tarjetas |
| White | `#ffffff` | Superficies, iconos sobre fondo oscuro |

### Enfoque de estilo

- **React Native `StyleSheet.create()`** — cada componente define sus estilos localmente.
- **`useSafeAreaInsets()`** — para respetar notch/barra de estado en iOS y Android.
- **`Platform.OS === 'android'`** — ajustes específicos de plataforma donde es necesario.
- **`expo-linear-gradient`** — gradientes en headers y cards destacadas.
- **`@expo/vector-icons` (Ionicons)** — iconografía estándar.
- NO hay sistema de design tokens centralizado de colores — son literales hardcodeados.

---

## 5. SISTEMA DE INTERNACIONALIZACIÓN

### Mobile App

**Estado:** Sin sistema i18n. Todo el texto está hardcodeado en español.

### Web App

**Sistema:** `i18next` + `react-i18next` + `i18next-browser-languagedetector`

**Idiomas soportados:** Español (es), Inglés (en), Chino Tradicional (zh)

**Estructura de archivos:**
```
web-app/src/locales/
├── en/
│   ├── files/
│   │   ├── common.json
│   │   └── courts.json
│   └── index.ts
├── es/
│   ├── files/
│   │   ├── common.json
│   │   └── courts.json
│   └── index.ts
└── zh/
    └── ...

web-app/src/features/grilla/i18n/   ← i18n propio de la grilla
├── es.ts
├── zh-HK.ts
├── translations.ts
└── I18nContext.tsx
```

**Patrón de uso:**
```typescript
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
// En JSX:
<Text>{t('common.save')}</Text>
```

---

## 6. CONEXIÓN CON SUPABASE

### Backend (`backend/src/lib/supabase.ts`)

Tres tipos de cliente:

```typescript
// Cliente con service role (acceso total — para operaciones admin)
export const getSupabaseServiceRoleClient = (): SupabaseClient

// Cliente con anon key
export const getSupabaseClient = (): SupabaseClient
export const getSupabaseAnonClient = (): SupabaseClient

// Configuración
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

// Sin persistencia de sesión (stateless API)
auth: { persistSession: false, autoRefreshToken: false }
```

**Ejemplos de queries en el backend:**

```typescript
// SELECT con relaciones anidadas (matches.ts)
const { data, error } = await supabase
  .from('matches')
  .select(`
    id, created_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status,
    bookings (
      id, start_at, end_at, total_price_cents, currency, court_id,
      courts (
        id, club_id, name, indoor, glass_type,
        clubs (id, name, address, city)
      )
    ),
    match_players (
      id, team, created_at, slot_index,
      players (id, first_name, last_name, elo_rating)
    )
  `)
  .order('created_at', { ascending: false })
  .limit(50);

// Filtro con .eq() y .neq() (bookings.ts)
const { data } = await supabase
  .from('bookings')
  .select('id, start_at, end_at, status')
  .eq('court_id', courtId)
  .neq('status', 'cancelled');

// INSERT (matches.ts)
const { data, error } = await supabase
  .from('matches')
  .insert({ booking_id, visibility, elo_min, elo_max, gender, competitive, status: 'open' })
  .select()
  .single();
```

### Web App (`web-app/src/lib/supabase.ts`)

```typescript
// Solo para reset de contraseña (flujo de redirect auth)
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function getSupabaseClient(): SupabaseClient | null {
  if (!url?.trim() || !anonKey?.trim()) return null;
  client = createClient(url, anonKey);
  return client;
}

// Parseo de hash params para flows de auth (reset password, email confirm)
export function parseHashParams(): {
  access_token?: string;
  refresh_token?: string;
  type?: string;
}
```

### Mobile App

La mobile app **NO** usa Supabase directamente. Toda la comunicación pasa por el backend Express vía `fetch()`.

---

## 7. PATRÓN DE USUARIO AUTENTICADO

### AuthContext (`mobile-app/src/contexts/AuthContext.tsx`)

```typescript
// Tipo de sesión
type Session = {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    user_metadata?: { full_name?: string };
  };
};

// Valor del contexto
type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (s: Session | null) => void;
  logout: () => Promise<void>;
};

// Clave de almacenamiento
const SESSION_KEY = '@padel_session';
// Guardado en: AsyncStorage (@react-native-async-storage/async-storage)
```

### Flujo de autenticación

1. App arranca → `AuthProvider` lee `AsyncStorage[@padel_session]`
2. Si hay sesión válida (con `access_token`) → `isAuthenticated = true`
3. Splash screen mínimo 2800ms para branding
4. Si no hay sesión → muestra `LoginScreen` / `RegisterScreen`

### Cómo usar en cualquier pantalla

```typescript
import { useAuth } from '../contexts/AuthContext';

const { session } = useAuth();

// Datos del usuario
const userId   = session?.user?.id;
const email    = session?.user?.email;
const fullName = session?.user?.user_metadata?.full_name;
const token    = session?.access_token;

// Llamada autenticada al backend
const res = await fetch(`${API_URL}/alguna-ruta`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

### Obtener el player ID del usuario actual

```typescript
// mobile-app/src/api/players.ts
export async function fetchMyPlayerId(token: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/players/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.ok && json.player) return json.player.id;
  return null;
}

// Patrón de uso en screens
const { session } = useAuth();
const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

useEffect(() => {
  if (session?.access_token) {
    fetchMyPlayerId(session.access_token).then(setMyPlayerId);
  }
}, [session?.access_token]);
```

### Middleware de autenticación en el backend

```typescript
// backend/src/middleware/attachAuthContext.ts
// Lee el header Authorization: Bearer <token>
// Llama a supabase.auth.getUser(token)
// Adjunta req.user = { id, email, ... }
```

---

## 8. ESTRUCTURA DEL BACKEND

### Rutas disponibles

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register` | Registro con email/contraseña |
| POST | `/auth/login` | Login → devuelve `{ session, user }` |
| POST | `/auth/forgot-password` | Envía email de recuperación |
| GET  | `/auth/me` | Devuelve usuario autenticado (Bearer token) |
| GET  | `/players` | Lista jugadores |
| GET  | `/players/:id` | Detalle de jugador |
| GET  | `/players/me` | Jugador del usuario autenticado |
| GET  | `/clubs` | Lista clubes |
| GET  | `/clubs/:id` | Detalle de club |
| GET  | `/courts` | Lista pistas (filtro: `?club_id=`) |
| GET  | `/courts/:id` | Detalle de pista |
| GET  | `/bookings` | Lista reservas (filtros: court_id, club_id, organizer_player_id, date) |
| GET  | `/bookings/:id` | Detalle de reserva |
| POST | `/bookings` | Crear reserva (valida conflictos, calcula precio) |
| PUT  | `/bookings/:id` | Actualizar reserva |
| DELETE | `/bookings/:id` | Cancelar reserva |
| GET  | `/matches` | Lista partidos (con `?expand=true` incluye relaciones) |
| GET  | `/matches/:id` | Detalle de partido |
| POST | `/matches` | Crear partido para una reserva |
| PUT  | `/matches/:id` | Actualizar partido (visibilidad, elo, etc.) |
| DELETE | `/matches/:id` | Eliminar partido |
| GET  | `/search/courts` | Buscar pistas disponibles (fecha, indoor, glass_type) |
| GET  | `/home/zone-trends` | Stats de tendencias de zona |
| POST | `/payments/create-intent` | Crear Stripe PaymentIntent |
| POST | `/payments/confirm-client` | Confirmar pago |
| POST | `/payments/webhook` | Webhook de Stripe |
| GET  | `/school-courses` | Lista cursos de escuela |
| POST | `/school-courses` | Crear curso |
| PUT  | `/school-courses/:id` | Actualizar curso |
| DELETE | `/school-courses/:id` | Eliminar curso |
| GET/POST/PUT/DELETE | `/pricing-rules` | Reglas de precio |
| GET/POST/PUT/DELETE | `/reservation-type-prices` | Precios por tipo |
| GET/POST/PUT/DELETE | `/inventario` | Inventario |
| GET/POST/PUT/DELETE | `/club-staff` | Personal de club |
| GET/POST/PUT/DELETE | `/club-owners` | Propietarios |
| GET/POST/PUT/DELETE | `/club-applications` | Solicitudes de alta |
| GET/POST/PUT/DELETE | `/booking-participants` | Participantes en reservas |
| GET/POST/PUT/DELETE | `/match-players` | Jugadores en partidos |
| GET  | `/health` | Health check |

---

## 9. VARIABLES DE ENTORNO

### Backend (`backend/.env.example`)

```env
PORT=3000
FRONTEND_URL=http://localhost:5173

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe — Dashboard > API Keys (sk_test_...)
STRIPE_SECRET_KEY=
# Webhook: stripe listen --forward-to localhost:3000/payments/webhook
STRIPE_WEBHOOK_SECRET=
```

### Web App (`web-app/.env.example`)

```env
VITE_API_BASE=http://localhost:3000
# Solo para pantalla reset password
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Mobile App (`mobile-app/src/config.ts`)

```typescript
// Variables de entorno Expo (prefijo EXPO_PUBLIC_)
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

// API URL — detectada automáticamente por plataforma/entorno
export const API_URL = getApiUrl();
// - Expo Go (físico): http://<host-metro>:3000
// - Android emulador: http://10.0.2.2:3000
// - iOS simulador: http://localhost:3000
```

---

## 10. PATRONES DE CÓDIGO

### Patrón 1 — Pantalla con datos remotos (HomeScreen)

```typescript
// 1. Imports
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Text, Pressable } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { fetchMatches } from '../api/matches';
import { fetchMyPlayerId } from '../api/players';

// 2. Props de navegación (callbacks del padre)
type HomeScreenProps = {
  onPartidoPress?: (partido: PartidoItem) => void;
  onNavigateToTab?: (tab: TabId) => void;
};

export function HomeScreen({ onPartidoPress, onNavigateToTab }: HomeScreenProps) {
  // 3. Auth
  const { session } = useAuth();

  // 4. Estado local
  const [items, setItems] = useState<PartidoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  // 5. Obtener player ID al montar
  useEffect(() => {
    if (session?.access_token) {
      fetchMyPlayerId(session.access_token).then(setMyPlayerId);
    }
  }, [session?.access_token]);

  // 6. Fetch de datos (useCallback para poder reejecutar)
  const loadData = useCallback(async () => {
    setLoading(true);
    const matches = await fetchMatches({ expand: true });
    setItems(matches.map(mapMatchToPartido).filter(Boolean));
    setLoading(false);
  }, [myPlayerId]);

  useEffect(() => { loadData(); }, [loadData]);

  // 7. Render con loading state
  return (
    <ScrollView style={styles.container}>
      {loading ? (
        <Skeleton />
      ) : (
        items.map((item) => (
          <Pressable key={item.id} onPress={() => onPartidoPress?.(item)}>
            <PartidoCard item={item} onPress={() => onPartidoPress?.(item)} />
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

// 8. Estilos al final del archivo
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
});
```

### Patrón 2 — Pantalla con filtros y búsqueda (MatchSearchScreen)

```typescript
// Delega lógica de filtros a un custom hook
const {
  filters, applyFilters, clearFilters,
  results, resultCount, loading,
  sportLabel, dateLabel, timeRangeLabel,
} = useMatchSearch();

const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);

return (
  <ScrollView>
    <SearchFilterBar
      sportLabel={sportLabel}
      dateLabel={dateLabel}
      timeRangeLabel={timeRangeLabel}
      onFiltersPress={() => setFiltersSheetVisible(true)}
    />
    <SearchFiltersSheet
      visible={filtersSheetVisible}
      onClose={() => setFiltersSheetVisible(false)}
      onApply={applyFilters}
      onClear={clearFilters}
      initialFilters={filters}
    />
    <SearchResultsList
      results={results}
      loading={loading}
      onCourtPress={onCourtPress}  // ← callback al padre para navegar
    />
  </ScrollView>
);
```

### Patrón 3 — Llamada autenticada al backend (api/*.ts)

```typescript
// mobile-app/src/api/matches.ts
import { API_URL } from '../config';

export async function fetchMatches(opts: { expand?: boolean; token?: string | null } = {}) {
  const url = new URL(`${API_URL}/matches`);
  if (opts.expand) url.searchParams.set('expand', 'true');

  const headers: Record<string, string> = {};
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return [];
  const json = await res.json();
  return json.matches ?? [];
}
```

### Patrón 4 — Custom Hook de datos

```typescript
// mobile-app/src/hooks/useHomeStats.ts
import { useEffect, useState } from 'react';
import { fetchHomeStats } from '../api/home';
import { useAuth } from '../contexts/AuthContext';

export function useHomeStats() {
  const { session } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHomeStats(session?.access_token).then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, [session?.access_token]);

  return { stats, loading };
}
```

---

## 11. DEPENDENCIAS RELEVANTES

### Mobile App (`mobile-app/package.json`)

**Framework:**
```json
"react": "19.1.0",
"react-native": "0.81.5",
"expo": "~54.0.0"
```

**UI & Iconos:**
```json
"@expo/vector-icons": "^15.1.1",     // Ionicons, MaterialIcons, etc.
"expo-linear-gradient": "~15.0.8",   // Gradientes
"expo-status-bar": "~3.0.9",
"expo-asset": "~12.0.12",
"react-native-safe-area-context": "~5.6.0",  // Notch/insets
"react-native-svg": "15.12.1"
```

**Estado & Almacenamiento:**
```json
"@react-native-async-storage/async-storage": "2.2.0"  // Persistencia de sesión
```

**Pagos:**
```json
"@stripe/stripe-react-native": "0.50.3"
```

**Sliders:**
```json
"@react-native-community/slider": "5.0.1"
```

**NO hay:** React Navigation, Redux, Zustand, React Query. La navegación es manual con `useState`.

### Backend (`package.json`)

```json
"express": "^4.18.2",
"@supabase/supabase-js": "^2.56.1",
"stripe": "^20.4.1",
"cors": "^2.8.5",
"morgan": "^1.10.0",
"dotenv": "^16.0.3",
"multer": "^2.1.0"
```

### Web App (`package.json`)

```json
// UI
"@radix-ui/react-*": varios componentes,
"lucide-react": "^0.546.0",
"tailwindcss": "^4.1.12",
"framer-motion": "^12.23.24",
"sonner": "^2.0.7",          // Toasts/notificaciones

// Estado
"zustand": "^5.0.11",
"react-hook-form": "^7.65.0",

// Routing
"react-router-dom": "^7.8.2",

// i18n
"i18next": "^25.6.0",
"react-i18next": "^16.0.1",

// Datos/Charts
"recharts": "^3.3.0",
"chart.js": "^4.5.0",
"date-fns": "^4.1.0",

// Mapas
"leaflet": "^1.9.4",
"react-leaflet": "^5.0.0",

// Exports
"jspdf": "^3.0.4",
"xlsx": "^0.18.5"
```

---

## 12. ESQUEMA DE BASE DE DATOS (INFERIDO)

No hay archivos de schema locales. La BD está gestionada en Supabase. Las siguientes tablas se infieren del código:

### Tablas principales

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `players` | id, first_name, last_name, elo_rating | → auth.users |
| `clubs` | id, name, address, city | |
| `courts` | id, club_id, name, indoor (bool), glass_type (normal/panoramic) | → clubs |
| `bookings` | id, court_id, organizer_player_id, start_at, end_at, total_price_cents, currency, status, timezone, reservation_type, source_channel | → courts, players |
| `booking_participants` | id, booking_id, player_id | → bookings, players |
| `matches` | id, booking_id, visibility (public/private), elo_min, elo_max, gender, competitive, status | → bookings |
| `match_players` | id, match_id, player_id, team (A/B), slot_index | → matches, players |
| `club_owners` | id, club_id, user_id | → clubs |
| `club_staff` | id, club_id, user_id, role | → clubs |
| `club_applications` | id, club_id, status | |
| `club_school_courses` | id, club_id, court_id, starts_on, ends_on, is_active | → clubs, courts |
| `club_school_course_days` | course_id, weekday, start_time, end_time | → club_school_courses |
| `pricing_rules` | id, club_id, court_id, ... | → clubs, courts |
| `reservation_type_prices` | id, club_id, reservation_type, price_cents | → clubs |
| `payments` | id, booking_id, stripe_payment_intent_id, status | → bookings |
| `inventory` | id, club_id, ... | → clubs |
| `privacy_logs` | id, user_id, action, ... | |

---

## 13. QUÉ EXISTE VS. QUÉ CREAR

### Para el Módulo de Aprendizaje (mobile-app)

#### REUTILIZAR (ya existe):

| Elemento | Dónde está | Cómo reutilizar |
|---|---|---|
| Autenticación | `AuthContext.tsx` + `useAuth()` | Igual que en HomeScreen y PartidosScreen |
| Layout de pantalla | `ScreenLayout` + `BackHeader` | Envolver nuevas pantallas |
| Bottom Navbar (tab 'competir') | `BottomNavbar.tsx` | Ya existe el tab, conectar a nueva pantalla |
| Skeleton de carga | `Skeleton.tsx` + `PartidoCardSkeleton.tsx` | Para estados de carga en listas |
| Patrón API fetch | `api/matches.ts`, `api/players.ts` | Misma estructura para `api/courses.ts` |
| Patrón de hook de datos | `useHomeStats.ts`, `useMatchSearch.ts` | Crear `useCourses.ts`, `useLesson.ts` |
| Theme (spacing, fontSize) | `theme.ts` | `theme.spacing.md`, `theme.fontSize.base`, etc. |
| Ionicons | `@expo/vector-icons` | Ya instalado |
| LinearGradient | `expo-linear-gradient` | Ya instalado |
| SafeAreaInsets | `react-native-safe-area-context` | Ya instalado |
| Ruta backend `/school-courses` | `backend/src/routes/schoolCourses.ts` | Endpoint ya existe |

#### CREAR DESDE CERO:

| Elemento | Descripción |
|---|---|
| `screens/AprendizajeScreen.tsx` | Pantalla principal del módulo (nuevo tab o dentro de 'competir') |
| `screens/CursoDetailScreen.tsx` | Detalle de un curso de escuela |
| `screens/LeccionScreen.tsx` | Pantalla de lección/clase individual |
| `screens/MiProgresoScreen.tsx` | Progreso del jugador en cursos |
| `api/courses.ts` | Funciones fetch para cursos (GET /school-courses) |
| `api/lessons.ts` | Funciones fetch para lecciones (si hay endpoint) |
| `hooks/useCourses.ts` | Hook para listar/filtrar cursos |
| `hooks/useMyProgress.ts` | Hook para progreso del jugador |
| `components/aprendizaje/CursoCard.tsx` | Tarjeta de curso (similar a PartidoCard) |
| `components/aprendizaje/CursoCardSkeleton.tsx` | Skeleton de carga |
| `components/aprendizaje/ProgressBar.tsx` | Barra de progreso visual |
| `components/aprendizaje/NivelBadge.tsx` | Badge de nivel (si no reutiliza el de PartidoCard) |
| Nuevas rutas en backend | Si se necesitan endpoints de progreso, inscripción, etc. |
| Nuevas tablas en Supabase | `player_course_enrollments`, `player_lesson_completions`, etc. (si no existen) |

#### VERIFICAR (puede existir o no):

| Elemento | Cómo verificar |
|---|---|
| Tabla `club_school_courses` en Supabase | Confirmar campos exactos con el equipo/Supabase dashboard |
| Endpoints de inscripción a cursos | Revisar `backend/src/routes/schoolCourses.ts` en detalle |
| Tipo `TabId` en `MainApp.tsx` | Si se añade tab 'aprender', actualizar el union type |
| Colores de marca en `theme.ts` | El rojo `#E31E24` no está en theme.ts — añadirlo si se usa en el módulo |

---

*Fin del documento. Actualizar cuando se añadan nuevas pantallas, rutas o dependencias.*

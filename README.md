# padel_mono_repo

Monorepo con frontend y backend para la app de pádel.

## Estructura

```
├── mobile-app/   # App móvil React Native (Expo)
└── backend/      # API Express + Supabase
```

## Mobile app

App móvil con React Native y Expo. iOS y Android.

### Dependencias

- **Expo** ~54
- **React Native** 0.81
- **React** 19
- **TypeScript** ~5.9
- **expo-asset**, **expo-status-bar**, **babel-preset-expo**

### Requisitos

- Node.js >= 18
- Expo Go (en el celular) o emulador iOS/Android

### Comandos

```bash
cd mobile-app
npm install
npm start        # Servidor Expo → escanear QR con Expo Go
npm run android  # Abrir en emulador Android
npm run ios      # Abrir en simulador iOS
```

### Prueba en dispositivo

1. Instalar **Expo Go** (Play Store / App Store)
2. `npm start` y escanear el QR
3. Celular y PC en la misma red WiFi

### Build para producción

```bash
npx eas build --platform android   # APK/AAB
npx eas build --platform ios       # IPA (requiere Apple Developer)
```

Requiere [EAS CLI](https://docs.expo.dev/build/setup/) y cuenta Expo.

### Ramas y ambientes Expo

| Rama git | Propósito | Canal EAS | Perfil build | Deploy automático |
|----------|-----------|-----------|--------------|-------------------|
| `main` | Producción | `production` | `production` | OTA en cada push a `mobile-app/` |
| `develop` | Pruebas de devs | `develop` | `develop` | OTA en cada push a `mobile-app/` |
| `demo` | Demos estables | `demo` | `demo` | OTA en cada push a `mobile-app/` |

Las tres ramas comparten el mismo proyecto Expo (`padel-app`) pero no se pisan: cada una publica en su canal.

**CI (GitHub Actions):**
- `eas-update.yml` — publica OTA al pushear a `main`, `develop` o `demo` (solo si cambia `mobile-app/`).
- `eas-android.yml` — build nativo Android manual (Actions → EAS Android Build → elegir perfil).

**Setup inicial en Expo (una sola vez, canal `develop`):**
```bash
cd mobile-app
eas channel:create develop
eas channel:edit develop --branch develop
```

**Comandos manuales (si hace falta):**
```bash
# Main / producción
npx eas build --platform android --profile production
npx eas update --branch main --environment production

# Develop / pruebas internas
npx eas build --platform android --profile develop
npx eas update --branch develop --environment preview

# Demo / clientes
npx eas build --platform android --profile demo
npx eas update --branch demo --environment preview
```

**Notificaciones Slack** (OTA y builds con link al QR en Expo):

1. En Slack: [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. **Incoming Webhooks** → activar → **Add New Webhook to Workspace** → elegir canal (ej. `#wematch-deploys`).
3. Copiar la URL del webhook (`https://hooks.slack.com/services/...`).
4. En GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Nombre: `SLACK_WEBHOOK_URL`
   - Valor: la URL del webhook
5. Listo. Cada OTA o build manual manda un mensaje con color por ambiente:
   - Producción (`main`) — rojo
   - Develop — azul
   - Demo — verde

| Evento | Qué avisa Slack |
|--------|-----------------|
| Push con cambios en `mobile-app/` | OTA publicado + link a updates del branch en Expo |
| Actions → EAS Android Build | APK listo + link a la página del build (ahí está el **QR** de instalación) |

Sin `SLACK_WEBHOOK_URL` el deploy funciona igual; solo se omite el aviso.

### Conectar con backend

Para apuntar a la API, crear `.env` en `mobile-app/` con:
```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```
En producción, usar la URL del backend y la clave publishable de Stripe.

---

## Backend

API Express con TypeScript, Supabase, Morgan y CORS. Despliegue en Fly.io.

### Dependencias

- **Express 4**
- **TypeScript 5**
- **Supabase** (@supabase/supabase-js)
- **Morgan** (logging HTTP)
- **CORS**
- **dotenv**

### Requisitos

- Node.js >= 18

### Variables de entorno

Copiar `.env.example` a `.env` y completar:

```
PORT=3000
NODE_ENV=development
FRONTEND_URL=   # Opcional; CORS permite todos por defecto

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # Opcional: para webhooks. En local: stripe listen --forward-to localhost:3000/payments/webhook
```

### Comandos

```bash
cd backend
npm install
npm run dev    # Desarrollo (http://localhost:3000)
npm run build  # Compilar TypeScript
npm start      # Producción
```

### Endpoints

- `GET /` — Mensaje de bienvenida
- `GET /health` — Health check básico
- `GET /health/supabase` — Verifica conexión a Supabase
- `POST /payments/create-intent` — Crea PaymentIntent (Booking: Bearer token). Body: `{ booking_id, participant_id }`
- `POST /payments/confirm-client` — Confirma pago tras éxito en cliente (fallback si webhook no llega)
- `POST /payments/webhook` — Webhook Stripe (body raw)

### Despliegue (Fly.io)

```bash
cd backend
fly launch   # Primera vez (configurar secrets para SUPABASE_*)
fly deploy   # Despliegues posteriores
```
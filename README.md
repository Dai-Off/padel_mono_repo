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

### Conectar con backend

Para apuntar a la API, crear `.env` en `mobile-app/` con:
```
EXPO_PUBLIC_API_URL=http://localhost:3000
```
En producción, usar la URL del backend en Fly.io.

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
- `GET /health/supabase` — Verifica conexión a Supabase (requiere RPC `now()` en Supabase)

### Despliegue (Fly.io)

```bash
cd backend
fly launch   # Primera vez (configurar secrets para SUPABASE_*)
fly deploy   # Despliegues posteriores
```
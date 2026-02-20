# padel_mono_repo

Monorepo con frontend y backend para la app de pádel.

## Estructura

```
├── frontend/     # App móvil React Native (Expo)
└── backend/      # API Express + Supabase
```

## Frontend

App móvil con React Native y Expo. iOS y Android.

### Dependencias

- **Expo** ~52
- **React Native** 0.76
- **React** 18
- **TypeScript**

### Requisitos

- Node.js >= 18
- Expo Go (en el celular) o emulador

### Comandos

```bash
cd frontend
npm install
npm start        # Servidor Expo (QR para Expo Go)
npm run android  # Abrir en emulador Android
npm run ios      # Abrir en simulador iOS
```

### Build para producción

Usar EAS Build (Expo Application Services) para generar APK/IPA para las tiendas.

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
FRONTEND_URL=http://localhost:5173

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
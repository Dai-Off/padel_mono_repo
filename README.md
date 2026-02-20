# padel_mono_repo

Monorepo con frontend y backend para la app de pádel.

## Estructura

```
├── frontend/     # App React + Vite
└── backend/      # API Express + Supabase
```

## Frontend

App React con Vite, TypeScript, React Router y Tailwind CSS. Despliegue en Fly.io.

### Dependencias

- **React 19**
- **Vite 7**
- **TypeScript 5**
- **React Router DOM 7**
- **Tailwind CSS 4**
- **@vitejs/plugin-react-swc**

### Requisitos

- Node.js >= 18

### Comandos

```bash
cd frontend
npm install
npm run dev      # Desarrollo (http://localhost:5173)
npm run build    # Build de producción
npm run preview  # Vista previa del build
```

### Despliegue (Fly.io)

```bash
cd frontend
fly launch   # Primera vez
fly deploy   # Despliegues posteriores
```

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
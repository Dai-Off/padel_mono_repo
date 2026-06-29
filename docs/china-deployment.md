# Despliegue en China — Arquitectura y plan de migración

Objetivo: tener la plataforma funcionando para usuarios de **China** para **agosto**,
sin romper el proyecto actual ("global").

**Proyectos en alcance para China:** `backend` (`padel-be`), `webapp-wechat` y
`mobile-app` (Expo / React Native). Queda **fuera** `web-app` (panel admin).

Estrategia: **un solo código**, en la rama `feature/china-deploy`, con **adapters
elegibles por variables de entorno**. Si las env de China no están seteadas, el
comportamiento es idéntico a hoy (Supabase + Mock). La base actual es **solo lectura**;
todo lo de China es una **réplica**.

---

## 1. Arquitectura objetivo (China)

| Capa | Hoy (global) | China |
|---|---|---|
| Hosting | Fly.io (gru) | Aliyun ECS (Shanghái/Pekín) + CDN Aliyun |
| DB | Supabase Postgres (Frankfurt) | Aliyun RDS for PostgreSQL |
| Storage | Supabase Storage | Aliyun OSS |
| Auth | Supabase Auth | Auth propio (JWT) / Authing |
| Realtime | Supabase Realtime | WebSocket propio (`ws`) |
| Edge Functions | Supabase Functions | Endpoints / cron en el backend |
| Pagos | Stripe / mock | WeChat Pay + Alipay |
| IA | OpenAI | DeepSeek / Qwen (DashScope) |
| Email | nodemailer/SMTP | Aliyun DirectMail |
| Moderación | Sightengine | Aliyun Content Moderation |
| Dominio | `.fly.dev` | dominio con **ICP filing** obligatorio |

## 2. Costuras ya implementadas (no cambian el comportamiento global)

- `backend/src/lib/config/providers.ts` — selección por env:
  - `DEPLOY_REGION` = `global` (default) | `china`
  - `STORAGE_PROVIDER` = `supabase` (default) | `oss`
  - `PAYMENT_PROVIDER` = `mock` (default) | `wechatpay` | `alipay`
- `backend/src/lib/storage/` — adapter de storage:
  - `IStorageProvider` (interface), `SupabaseStorageProvider` (default), `OssStorageProvider` (stub), `getStorage()` (factory).
- `backend/src/lib/payment/` — extendido el patrón existente con `WeChatPayProvider` y `AlipayProvider` (stubs) seleccionados por env.

> Pendiente de cableado incremental: migrar los ~12 call sites que hoy llaman
> `supabase.storage.from(...)` directamente para que usen `getStorage()`. Se hace
> tabla por tabla/ruta por ruta, sin big-bang.

## 3. Servicios bloqueados en China y su reemplazo

| Servicio | Dónde se usa | Reemplazo |
|---|---|---|
| Stripe | `routes/payments.ts`, wallet, bookings | WeChat Pay / Alipay (stubs creados) |
| OpenAI (`api.openai.com`) | `lib/openaiPeerFeedbackInsight.ts` | DeepSeek / Qwen (API compatible) |
| Sightengine | `services/communityModerationService.ts` | Aliyun Content Moderation |
| icons8.com (emails) | `lib/mailer.ts` | self-host en OSS |
| SMTP actual | `lib/mailer.ts` | Aliyun DirectMail (si el actual está bloqueado) |
| n8n webhook (IA match) | `mobile-app` `eas.json` (`...n8n-v2.fly.dev`) | relocar a Asia/China |
| OpenWeather | `mobile-app/src/config.ts` | verificar latencia; alternativa local si hace falta |
| Expo OTA (`u.expo.dev`) | `mobile-app/app.json` `updates.url` | self-host EAS Update o desactivar OTA |

## 4. Base de datos

Ver `infra/china/db/`:
- `README.md` — método de migración (pg_dump → adaptar → restore en RDS).
- `extract-schema.ps1` / `.sh` — extracción **solo lectura** (la corrés vos).
- `tables-inventory.md` — 113 tablas con volúmenes reales.

Puntos críticos: referencias a `auth.users`, políticas RLS, `supabase_vault`
(sin equivalente en RDS) y `pgvector` para `players_vector`.

## 4.1 Mobile app (Expo / React Native)

Config por `EXPO_PUBLIC_*` (en `eas.json`): `API_URL`, Stripe, Supabase, webhook n8n,
OpenWeather. Para China se cambian esas vars al backend/servicios de la región nueva.

- **Distribución (lo más crítico y propio del móvil):**
  - Android: Google Play está bloqueado → publicar en tiendas chinas (Huawei AppGallery,
    Xiaomi, OPPO, vivo, Tencent MyApp). Suelen exigir **软著** (copyright de software) y
    filing del backend.
  - iOS: el App Store de China **exige ICP (备案)** para apps con servicios de internet.
- **OTA updates**: `u.expo.dev` puede fallar en mainland → self-host EAS Update o desactivar.
- **Pagos**: `@stripe/stripe-react-native` → WeChat Pay / Alipay (SDK nativo) para China.
- **Supabase directo** desde el cliente: misma latencia/GFW; preferir pasar por el backend
  (los avatares ya lo hacen).
- Ya existe localización `zh-HK` (`src/content/infoContent.zh-HK.ts`).

> ⚠️ **Matiz clave sobre el plan HK-sin-ICP:** Hong Kong evita el ICP para **hostear la
> web** (`webapp-wechat` en navegador/WeChat). Pero la **distribución del móvil en China**
> (iOS App Store China y tiendas Android chinas) **sí requiere ICP/软著**. Es decir: el
> camino HK desbloquea YA la web, pero el lanzamiento nativo del móvil seguirá necesitando
> los trámites legales.

## 5. Roadmap hacia agosto (con checklist)

### Fase 0 — Legal (camino crítico, arrancar YA)
- [ ] Entidad legal china (o socio local) titular del dominio.
- [ ] Cuenta Aliyun + dominio + **ICP filing** (tarda semanas).

### Fase 1 — Fundaciones de código (en curso)
- [x] Rama `feature/china-deploy` + config de providers por env.
- [x] Adapter de storage (Supabase default + stub OSS).
- [x] Stubs de pago WeChat/Alipay seleccionables por env.
- [ ] Cablear call sites de storage a `getStorage()` (incremental).

### Fase 2 — Datos
- [ ] Provisionar Aliyun RDS for PostgreSQL.
- [ ] Extraer schema (solo lectura) y adaptarlo a RDS.
- [ ] Restaurar y verificar `count(*)` vs inventario.

### Fase 3 — Storage
- [ ] Crear buckets OSS + credenciales.
- [ ] Implementar `OssStorageProvider` (SDK `ali-oss`).
- [ ] Migrar archivos existentes Supabase Storage → OSS.

### Fase 4 — Auth
- [ ] Definir proveedor (JWT propio vs Authing).
- [ ] Migrar usuarios desde `auth.users`.
- [ ] Reescribir `routes/auth.ts` y middlewares detrás de una interfaz.

### Fase 5 — Pagos
- [ ] Implementar WeChat Pay / Alipay (orden + webhook de confirmación).
- [ ] Adaptar wallet y bookings al flujo asíncrono.

### Fase 6 — Servicios varios
- [ ] IA → DeepSeek/Qwen. Email → DirectMail. Moderación → Aliyun. Self-host de assets.

### Fase 7 — Deploy
- [ ] Backend + `webapp-wechat` en la región nueva (HK/Asia o ECS mainland), HTTPS, CDN.
- [ ] `.env` de China (`DEPLOY_REGION=china`, etc.).
- [ ] `mobile-app`: build EAS con `EXPO_PUBLIC_*` apuntando al backend de China; OTA self-host o off.
- [ ] Distribución móvil: 软著 + tiendas Android chinas; iOS App Store China (requiere ICP).
- [ ] Smoke tests end-to-end desde China.

### Fase 8 — Hardening
- [ ] Realtime (`ws`) y cron (reemplazo de Edge Functions).
- [ ] Observabilidad, backups RDS, plan de rollback.

## 6. Riesgos principales

1. **ICP** es el cuello de botella temporal (semanas, requiere entidad china).
2. **Auth y Pagos**: reescrituras sensibles (sesiones y dinero).
3. **Migración de datos**: ventana + verificación; `club_day_schedule` es voluminosa.
4. **Seguridad preexistente**: 99 tablas sin RLS con `anon key` pública (evaluar aparte).

## 7. Cómo probar que no rompimos lo actual

- `cd backend && npx tsc --noEmit` → sin errores (verificado).
- Sin env de China, `getStorage()` devuelve Supabase y `getProvider()` devuelve Mock:
  comportamiento idéntico al de producción global.

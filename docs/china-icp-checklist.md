# China — Checklist de ICP + credenciales a pedir

Documento para coordinar con el CTO y con la **persona/entidad en China**.
Objetivo: fijar todo lo que depende de China y esperar a que hagan su parte mientras
nosotros avanzamos con el código (rama `feature/china-deploy`).

> Contexto: la app es **100% para China** → todos los datos deben vivir en **China
> continental** (requisito de residencia de datos, PIPL / Ley de Ciberseguridad).
> Esto obliga a: DB en China (Aliyun/Tencent), **ICP**, y migrar fuera de
> Supabase / Stripe / OpenAI.

---

## Parte A — Trámites legales / ICP (los hace la entidad china)

### A.1 ICP 备案 (filing / registro básico) — obligatorio para hostear en China
- [ ] **Entidad legal en China continental** con 营业执照 (*licencia de negocios*).
      Empresa extranjera → necesita **WFOE** o **socio/entidad local** como titular.
      **(Bloqueante principal — define el cronograma.)**
- [ ] **Cuenta en Aliyun (o Tencent) China** a nombre de la entidad.
- [ ] **Dominio propio** registrado a nombre de la entidad (registrador acreditado en China).
- [ ] **Representante legal**: 身份证 (*documento de identidad chino*), teléfono chino,
      y foto de verificación (con el fondo/telón que provee el cloud).
- [ ] **Contenido de la app** coherente con el rubro de la licencia.
- [ ] 实名认证 (*verificación de identidad real*) de la cuenta cloud completada.

### A.2 Licencia ICP comercial — probablemente necesaria (la app tiene tienda + pagos)
- [ ] 经营性ICP (*ICP comercial / operativo*), formalmente
      增值电信业务许可证 (*Licencia de Servicios de Telecomunicaciones de Valor Agregado*),
      tambien conocida como **EDI license** (*Electronic Data Interchange*).
- [ ] Confirmar con asesor legal chino si el modelo (reservas + tienda + pagos) la exige.

### Tiempos estimados
- 备案 básico: ~2-3 semanas (con entidad + hosting + dominio listos).
- Licencia comercial: más tiempo (puede ser meses).

---

## Parte B — Credenciales / datos que nos deben pasar

> Regla: **credenciales acotadas por servicio** (usuarios **RAM** = subcuentas con
> permisos mínimos), **nunca** el login/root de la cuenta. Se cargan como secrets/env
> en el backend, nunca en el código ni commiteadas.

### B.1 Base de datos — Aliyun RDS for PostgreSQL
- [ ] **Host / endpoint**
- [ ] **Puerto** (normalmente 5432)
- [ ] **Nombre de la base**
- [ ] **Usuario de aplicación + contraseña** (NO el admin)
- [ ] Versión de PostgreSQL de la instancia
- [ ] Confirmar extensiones disponibles: `pgvector`, `pg_cron`, `pgcrypto`, `uuid-ossp`
- [ ] IP/red desde donde se permite conexión (whitelisting)

### B.2 Storage de archivos — Aliyun OSS
- [ ] **AccessKey ID** (de un usuario RAM con permiso solo OSS)
- [ ] **AccessKey Secret**
- [ ] **Bucket** (nombre)
- [ ] **Región / endpoint**
- [ ] **URL pública / CDN** del bucket (para servir imágenes)

### B.3 Pagos (registrados a nombre de la entidad china)
- [ ] **WeChat Pay**: `mch_id`, `app_id`, API v3 key, certificado + serial, private key
- [ ] **Alipay**: `app_id`, private key, public key de Alipay
- [ ] URLs de notificación (webhooks) permitidas

### B.4 Email / SMS (si se usan en China)
- [ ] **Aliyun DirectMail**: credenciales + dominio remitente verificado
- [ ] **SMS** (si aplica): credenciales del proveedor

### B.5 Cómputo / deploy
- [ ] Acceso a **ECS** (servidores) o el método de deploy acordado (RAM con permisos)
- [ ] **Dominio** ya con ICP aprobado apuntando al servidor

### B.6 IA y otros (servicios bloqueados a reemplazar)
- [ ] Proveedor de IA local elegido (DeepSeek / Qwen-DashScope) + API key
      → reemplaza OpenAI
- [ ] Confirmar reemplazo de Sightengine (moderación) si se usa → Aliyun Content Moderation

---

## Parte C — Lo que queda SIEMPRE con la entidad china (no nos lo pasan)
- Login/root de la cuenta Aliyun/Tencent.
- Licencia de negocios, ICP, dominio, verificación de identidad.
- Cuentas merchant de WeChat Pay/Alipay (solo nos dan las keys de integración).

---

## Parte D — Lo que avanzamos nosotros en paralelo (sin esperar a China)
- [x] Rama `feature/china-deploy` con adapters por env (storage/pagos), default = Supabase/Mock.
- [x] Inventario real de la DB (113 tablas) y plan de réplica (`infra/china/db/`).
- [ ] Cablear call sites de storage a la capa `getStorage()`.
- [ ] Implementar `OssStorageProvider` (cuando lleguen credenciales OSS — B.2).
- [ ] Implementar pagos WeChat/Alipay (cuando lleguen credenciales — B.3).
- [ ] Reemplazar OpenAI por proveedor local (B.6).

---

## Responsables
- **Persona/entidad en China**: Parte A (legal/ICP) + Parte B (credenciales).
- **CTO / empresa**: decidir entidad legal y presupuesto; validar licencia comercial.
- **Nosotros (dev)**: Parte D (código listo para enchufar las credenciales).

## Camino crítico
**A.1 (entidad legal china)** es lo que más demora y bloquea todo lo demás.
Sin entidad → no hay ICP → no hay hosting en China → no hay deploy.
Hay que destrabar eso primero para llegar a agosto.

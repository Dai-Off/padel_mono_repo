# Migración de base de datos a China (Aliyun RDS for PostgreSQL)

> **Regla de oro:** la base Supabase actual es de **solo lectura** en este proceso.
> Todo lo de China es una **réplica**. Nunca se altera el origen.

## Origen (estado real capturado)

- Proyecto Supabase: `oxowmfhnorxnabhzkcmi`, región `eu-central-1` (Frankfurt).
- Schema `public`: **113 tablas**. Ver `tables-inventory.md`.
- Extensiones instaladas:

  | Extensión | ¿En Aliyun RDS? | Nota |
  |---|---|---|
  | `plpgsql` | Sí | core |
  | `pgcrypto` | Sí | recrear |
  | `uuid-ossp` | Sí | recrear |
  | `pg_stat_statements` | Sí | opcional |
  | `pg_cron` | Sí (según versión RDS) | reprogramar jobs |
  | `vector` (pgvector 0.8.0) | Sí | requerido por `players_vector` |
  | `supabase_vault` | **NO** | específico de Supabase; reemplazar manejo de secretos |

## Pasos

### 1. Extraer schema + datos (lo corrés vos, solo lectura)

```bash
export SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.oxowmfhnorxnabhzkcmi.supabase.co:5432/postgres"
./extract-schema.sh        # o ./extract-schema.ps1 en Windows
```

Genera `dump/schema.public.sql` y `dump/data.public.dump`.
**No commitear `dump/`** (puede contener datos sensibles) — ya está en `.gitignore`.

### 2. Adaptar el schema a RDS (quitar lo específico de Supabase)

El dump de `public` puede referenciar objetos que en RDS no existen:

- Referencias a `auth.users` (Supabase Auth). En China el auth es propio → estos FKs
  deben apuntar a la tabla de usuarios nueva o eliminarse/ajustarse.
- Políticas **RLS** y `GRANT`s a roles `anon`/`authenticated`/`service_role`:
  en el backend de China se accede con un único rol de app → revisar si se mantienen.
- Llamadas a `vault.*` / `supabase_vault` → reemplazar por variables de entorno / KMS de Aliyun.
- Triggers o funciones que usen `auth.uid()` / `auth.role()` → reescribir.

### 3. Crear extensiones en RDS antes del restore

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
-- pg_cron según disponibilidad de la instancia RDS
```

### 4. Restaurar

```bash
psql "$RDS_URL" -f dump/schema.public.sql        # schema ya adaptado
pg_restore --no-owner --no-privileges -d "$RDS_URL" dump/data.public.dump
```

### 5. Verificación (réplica fiel)

- Comparar `count(*)` por tabla contra `tables-inventory.md`.
- Verificar secuencias (`setval`) tras cargar datos.
- Validar FKs y que `players_vector` (pgvector) quede consultable.

## Pendientes que NO resuelve la DB

- **Auth**: migrar usuarios desde `auth.users` (Supabase) al sistema de auth propio.
- **Storage**: los archivos viven en Supabase Storage → migrar a Aliyun OSS (aparte).
- **Realtime / Edge Functions**: se reimplementan en el backend (ver doc de arquitectura).

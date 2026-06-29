#!/usr/bin/env bash
# Extrae el schema (y opcionalmente los datos) de la base Supabase actual
# para replicarla en Aliyun RDS for PostgreSQL.
#
# SOLO LECTURA: pg_dump no modifica la base de origen.
# Requiere pg_dump (PostgreSQL client tools) y la connection string.
#
# Uso:
#   export SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.oxowmfhnorxnabhzkcmi.supabase.co:5432/postgres"
#   ./extract-schema.sh
#
# NO commitear el resultado si contiene datos sensibles.
set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-}"
OUT_DIR="${1:-"$(dirname "$0")/dump"}"

if [ -z "$DB_URL" ]; then
  echo "Falta SUPABASE_DB_URL (connection string de la base de origen, solo lectura)." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# 1) Schema-only del schema 'public' (sin owners ni privilegios, para portar a RDS).
pg_dump --schema-only --no-owner --no-privileges --schema=public \
  --file "$OUT_DIR/schema.public.sql" "$DB_URL"

# 2) Datos del schema 'public' (formato custom, comprimido, para restore selectivo).
pg_dump --data-only --no-owner --no-privileges --schema=public \
  --format=custom --file "$OUT_DIR/data.public.dump" "$DB_URL"

echo "Listo. Archivos en $OUT_DIR"
echo "  - schema.public.sql  -> revisar y adaptar a RDS (ver README)"
echo "  - data.public.dump   -> restaurar con pg_restore en RDS"

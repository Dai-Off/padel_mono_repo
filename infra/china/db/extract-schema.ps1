# Extrae el schema (y opcionalmente los datos) de la base Supabase actual
# para replicarla en Aliyun RDS for PostgreSQL.
#
# SOLO LECTURA: pg_dump no modifica la base de origen.
# Requiere tener pg_dump instalado (PostgreSQL client tools) y la connection string.
#
# Uso (PowerShell):
#   $env:SUPABASE_DB_URL = "postgresql://postgres:[PASSWORD]@db.oxowmfhnorxnabhzkcmi.supabase.co:5432/postgres"
#   ./extract-schema.ps1
#
# NO commitear el resultado si contiene datos sensibles.

param(
  [string]$DbUrl = $env:SUPABASE_DB_URL,
  [string]$OutDir = "$PSScriptRoot/dump"
)

if (-not $DbUrl) {
  Write-Error "Falta SUPABASE_DB_URL (connection string de la base de origen, solo lectura)."
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# 1) Schema-only del schema 'public' (sin owners ni privilegios, para portar a RDS).
pg_dump --schema-only --no-owner --no-privileges --schema=public `
  --file "$OutDir/schema.public.sql" "$DbUrl"

# 2) Datos del schema 'public' (formato custom, comprimido, para restore selectivo).
pg_dump --data-only --no-owner --no-privileges --schema=public `
  --format=custom --file "$OutDir/data.public.dump" "$DbUrl"

Write-Host "Listo. Archivos en $OutDir"
Write-Host "  - schema.public.sql  -> revisar y adaptar a RDS (ver README)"
Write-Host "  - data.public.dump   -> restaurar con pg_restore en RDS"

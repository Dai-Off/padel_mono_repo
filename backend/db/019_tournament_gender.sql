-- Torneo: categoría por género (opcional). null = sin filtro por género del jugador.
-- Si ya aplicaste una versión anterior con NOT NULL DEFAULT 'mixed', ejecuta también 020_tournament_gender_optional.sql.

alter table public.tournaments
  add column if not exists gender text
    check (gender is null or gender in ('male', 'female', 'mixed'));

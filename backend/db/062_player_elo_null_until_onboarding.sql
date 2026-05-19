-- ============================================================================
-- 062_player_elo_null_until_onboarding.sql
--
-- Limpia los defaults ficticios de elo_rating ('3.5') y liga ('bronce') para
-- que los jugadores que no han completado el cuestionario de nivelación tengan
-- nivel y liga = NULL en lugar de valores inventados.
--
-- Contexto:
--   - Antes de esta migración, cualquier jugador nuevo arrancaba con
--     elo_rating = 3.5 (default de la migración 014) y liga = 'bronce'
--     (default de la migración 037 con NOT NULL). Esos valores no derivan de
--     ningún cálculo real y hacen que la pantalla de Liga Competitiva muestre
--     datos engañosos.
--   - Tras esta migración: si onboarding_completed = false, elo_rating, liga y
--     mm_peak_liga quedan NULL. Al completar el cuestionario, players.ts:798
--     y el endpoint POST /players/onboarding asignan los valores reales.
--
-- mu, sigma y beta se quedan con sus defaults técnicos OpenSkill
-- (25.0 / 8.333 / 4.167). Son el prior bayesiano de "jugador desconocido", no
-- se muestran al usuario, y eloToMu() los recalibra al completar onboarding.
--
-- Idempotente: la migración no falla si se re-ejecuta.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. elo_rating: drop default 3.5 + permitir NULL + NULL para pendientes
-- ----------------------------------------------------------------------------
-- elo_rating venía con NOT NULL desde la migración inicial (anterior a 014).
-- Hay que quitar NOT NULL antes del UPDATE a NULL.

ALTER TABLE public.players ALTER COLUMN elo_rating DROP DEFAULT;
ALTER TABLE public.players ALTER COLUMN elo_rating DROP NOT NULL;

UPDATE public.players
SET elo_rating = NULL
WHERE onboarding_completed = false
  AND elo_rating IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. liga: drop default 'bronce', permitir NULL, NULL para pendientes
-- ----------------------------------------------------------------------------

ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_liga_chk;
ALTER TABLE public.players ALTER COLUMN liga DROP NOT NULL;
ALTER TABLE public.players ALTER COLUMN liga DROP DEFAULT;

UPDATE public.players
SET liga = NULL
WHERE onboarding_completed = false
  AND liga IS NOT NULL;

ALTER TABLE public.players
  ADD CONSTRAINT players_liga_chk
  CHECK (liga IS NULL OR liga IN ('bronce', 'plata', 'oro', 'elite'));

-- ----------------------------------------------------------------------------
-- 3. mm_peak_liga: NULL para pendientes
-- ----------------------------------------------------------------------------

UPDATE public.players
SET mm_peak_liga = NULL
WHERE onboarding_completed = false
  AND mm_peak_liga IS NOT NULL;

COMMIT;

-- ============================================================================
-- Verificación recomendada:
--
-- SELECT
--   COUNT(*) FILTER (WHERE elo_rating IS NULL) AS pendientes_elo,
--   COUNT(*) FILTER (WHERE liga IS NULL)       AS pendientes_liga,
--   COUNT(*) FILTER (WHERE mm_peak_liga IS NULL) AS pendientes_peak
-- FROM public.players
-- WHERE onboarding_completed = false;
--   -> Las 3 cuentas deben coincidir con el total de no-onboardings.
--
-- SELECT pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname = 'players_liga_chk';
--   -> Debe contener "liga IS NULL OR".
-- ============================================================================

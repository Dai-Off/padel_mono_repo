-- ============================================================
-- Migration 093: Optional tournament slot-hold TTL
-- invite_ttl_minutes NULL = el cupo reservado nunca expira.
-- Las inscripciones de torneos sin TTL se crean con
-- expires_at NULL (nunca se liberan automáticamente).
-- ============================================================

ALTER TABLE public.tournaments
  ALTER COLUMN invite_ttl_minutes DROP NOT NULL;

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_invite_ttl_minutes_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_invite_ttl_minutes_check
    CHECK (invite_ttl_minutes IS NULL OR invite_ttl_minutes > 0);

ALTER TABLE public.tournament_inscriptions
  ALTER COLUMN expires_at DROP NOT NULL;

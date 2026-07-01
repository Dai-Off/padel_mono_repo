-- Invitaciones: la plaza la elige el invitado al pagar; permitir reinvitar tras rechazo/expiración.

ALTER TABLE public.match_invites
  DROP CONSTRAINT IF EXISTS match_invites_match_id_slot_index_key;

ALTER TABLE public.match_invites
  DROP CONSTRAINT IF EXISTS match_invites_slot_index_check;

ALTER TABLE public.match_invites
  ALTER COLUMN slot_index DROP NOT NULL;

ALTER TABLE public.match_invites
  ADD CONSTRAINT match_invites_slot_index_check
  CHECK (slot_index IS NULL OR (slot_index >= 1 AND slot_index <= 3));

-- Una sola invitación activa por jugador y partido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_invites_active_player
  ON public.match_invites (match_id, invited_player_id)
  WHERE status IN ('pending', 'accepted') AND invited_player_id IS NOT NULL;

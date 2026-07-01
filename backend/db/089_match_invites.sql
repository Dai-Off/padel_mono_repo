-- Invitaciones por email a partidos privados (open_match + visibility private).

CREATE TABLE IF NOT EXISTS public.match_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  slot_index smallint NOT NULL CHECK (slot_index >= 1 AND slot_index <= 3),
  invite_email text NOT NULL,
  invited_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  invited_by_player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  token_hash text NOT NULL UNIQUE,
  invite_url text NOT NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, slot_index),
  UNIQUE (match_id, invite_email)
);

CREATE INDEX IF NOT EXISTS idx_match_invites_match_id ON public.match_invites(match_id);
CREATE INDEX IF NOT EXISTS idx_match_invites_player_id ON public.match_invites(invited_player_id);
CREATE INDEX IF NOT EXISTS idx_match_invites_email ON public.match_invites(lower(invite_email));

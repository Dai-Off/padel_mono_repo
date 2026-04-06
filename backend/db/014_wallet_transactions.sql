-- ──────────────────────────────────────────────────────────────────────────────
-- 014_wallet_transactions.sql
-- Saldo en cuenta por jugador y club.
-- amount_cents > 0  → crédito (saldo a favor)
-- amount_cents < 0  → débito  (saldo debe)
-- El saldo vigente se calcula como SUM(amount_cents) por (player_id, club_id).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           uuid        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id             uuid        NOT NULL REFERENCES public.clubs(id)   ON DELETE CASCADE,
  amount_cents        integer     NOT NULL,
  concept             text        NOT NULL,
  type                text        NOT NULL
    CHECK (type IN ('credit', 'debit', 'refund', 'adjustment')),
  booking_id          uuid        REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_by_auth_id  uuid,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_player       ON public.wallet_transactions (player_id);
CREATE INDEX IF NOT EXISTS idx_wallet_club         ON public.wallet_transactions (club_id);
CREATE INDEX IF NOT EXISTS idx_wallet_player_club  ON public.wallet_transactions (player_id, club_id);
CREATE INDEX IF NOT EXISTS idx_wallet_booking      ON public.wallet_transactions (booking_id);

-- Habilita Supabase Realtime en tablas usadas por la mobile app.
-- Mensajería directa sigue por WebSocket propio (/messages/ws) — no incluida aquí.
-- Idempotente: seguro ejecutar varias veces.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'bookings',
    'matches',
    'match_players',
    'match_invites',
    'matchmaking_pool',
    'matchmaking_pair_invites',
    'tournament_inscriptions',
    'tournament_chat_messages',
    'player_unlockables'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

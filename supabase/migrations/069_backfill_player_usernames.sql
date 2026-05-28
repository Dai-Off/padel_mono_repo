-- Asigna username por defecto a jugadores sin username (nombre_apellido; sufijo numérico si hay duplicados).
-- No modifica jugadores que ya tienen username.

DO $$
DECLARE
  r RECORD;
  base text;
  candidate text;
  suffix int;
BEGIN
  FOR r IN
    SELECT id, first_name, last_name, created_at
    FROM public.players
    WHERE (username IS NULL OR btrim(username) = '')
      AND status IS DISTINCT FROM 'deleted'
    ORDER BY created_at ASC, id ASC
  LOOP
    base := lower(
      regexp_replace(
        btrim(coalesce(r.first_name, '') || '_' || coalesce(r.last_name, '')),
        '[^a-z0-9]+',
        '_',
        'g'
      )
    );
    base := trim(both '_' from base);

    IF length(base) < 3 THEN
      base := 'player_' || left(replace(r.id::text, '-', ''), 8);
    END IF;

    IF length(base) > 30 THEN
      base := left(base, 30);
    END IF;

    candidate := base;
    suffix := 1;

    WHILE EXISTS (
      SELECT 1
      FROM public.players p2
      WHERE lower(p2.username) = lower(candidate)
        AND p2.status IS DISTINCT FROM 'deleted'
        AND p2.id <> r.id
    ) LOOP
      suffix := suffix + 1;
      candidate := left(base, greatest(3, 30 - length(suffix::text) - 1)) || '_' || suffix::text;
    END LOOP;

    UPDATE public.players
    SET username = candidate,
        updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;

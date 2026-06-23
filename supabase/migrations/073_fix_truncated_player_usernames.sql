-- Corrige usernames generados por un backfill defectuoso que usó substring(nombre, 2)
-- en lugar del nombre completo (p. ej. Santiago → antiago en vez de santiago).

DO $$
DECLARE
  r RECORD;
  base text;
  candidate text;
  suffix int;
  buggy text;
BEGIN
  FOR r IN
    SELECT id, first_name, last_name, username
    FROM public.players
    WHERE username IS NOT NULL
      AND btrim(username) <> ''
      AND status IS DISTINCT FROM 'deleted'
  LOOP
    buggy := lower(
      trim(both '_' from regexp_replace(
        btrim(coalesce(substring(btrim(r.first_name), 2), '') || '_' || coalesce(substring(btrim(r.last_name), 2), '')),
        '[^a-z0-9]+',
        '_',
        'g'
      ))
    );

    IF lower(r.username) <> buggy THEN
      CONTINUE;
    END IF;

    base := trim(both '_' from regexp_replace(
      lower(btrim(coalesce(r.first_name, '') || '_' || coalesce(r.last_name, ''))),
      '[^a-z0-9]+',
      '_',
      'g'
    ));

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

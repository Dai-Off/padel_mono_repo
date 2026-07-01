-- RPC atómica para asignar slot en match_players tras pago de guest.
-- Usa advisory lock por match_id para evitar carreras cuando varios pagan a la vez.

CREATE OR REPLACE FUNCTION public.claim_match_slot(
  p_match_id uuid,
  p_player_id uuid,
  p_preferred smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing smallint;
  v_taken smallint[];
  v_slot smallint;
  v_reassigned boolean := false;
  v_i smallint;
  v_pref_ok boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_match_id::text)::bigint);

  SELECT mp.slot_index INTO v_existing
  FROM match_players mp
  WHERE mp.match_id = p_match_id AND mp.player_id = p_player_id
  LIMIT 1;

  IF FOUND THEN
    v_slot := COALESCE(v_existing, 0);
    RETURN jsonb_build_object('ok', true, 'slot_index', v_slot, 'reassigned', false);
  END IF;

  SELECT COALESCE(array_agg(mp.slot_index ORDER BY mp.slot_index), ARRAY[]::smallint[])
  INTO v_taken
  FROM match_players mp
  WHERE mp.match_id = p_match_id AND mp.slot_index IS NOT NULL;

  IF COALESCE(array_length(v_taken, 1), 0) >= 4 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El partido no tiene plazas libres',
      'code', 'match_full'
    );
  END IF;

  IF p_preferred IS NOT NULL AND p_preferred >= 0 AND p_preferred <= 3 THEN
    v_pref_ok := NOT (p_preferred = ANY(v_taken));
    IF v_pref_ok THEN
      v_slot := p_preferred;
    END IF;
  END IF;

  IF v_slot IS NULL THEN
    FOR v_i IN 0..3 LOOP
      IF NOT (v_i = ANY(v_taken)) THEN
        v_slot := v_i;
        v_reassigned := (p_preferred IS NOT NULL AND p_preferred <> v_i);
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_slot IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No hay slot disponible',
      'code', 'no_slot'
    );
  END IF;

  IF p_preferred IS NOT NULL AND p_preferred >= 0 AND p_preferred <= 3 AND v_slot <> p_preferred THEN
    v_reassigned := true;
  END IF;

  INSERT INTO match_players (match_id, player_id, team, invite_status, slot_index)
  VALUES (
    p_match_id,
    p_player_id,
    CASE WHEN v_slot <= 1 THEN 'A' ELSE 'B' END,
    'accepted',
    v_slot
  );

  RETURN jsonb_build_object('ok', true, 'slot_index', v_slot, 'reassigned', v_reassigned);

EXCEPTION
  WHEN unique_violation THEN
    SELECT mp.slot_index INTO v_existing
    FROM match_players mp
    WHERE mp.match_id = p_match_id AND mp.player_id = p_player_id
    LIMIT 1;
    IF FOUND THEN
      v_slot := COALESCE(v_existing, 0);
      RETURN jsonb_build_object('ok', true, 'slot_index', v_slot, 'reassigned', false);
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Conflicto al asignar plaza',
      'code', 'slot_conflict'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_match_slot(uuid, uuid, smallint) TO service_role;

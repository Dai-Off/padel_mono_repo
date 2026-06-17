-- Capacidad de unión bajo lock: evita que más de 4 jugadores inicien pago a la vez.

CREATE OR REPLACE FUNCTION public.assert_guest_can_join_match(
  p_match_id uuid,
  p_booking_id uuid,
  p_player_id uuid,
  p_slot_index smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filled integer;
  v_in_flight integer;
  v_slot_taken boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_match_id::text)::bigint);

  IF EXISTS (
    SELECT 1 FROM match_players
    WHERE match_id = p_match_id AND player_id = p_player_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_in_match', 'remaining', 0);
  END IF;

  SELECT COUNT(*)::integer INTO v_filled
  FROM match_players
  WHERE match_id = p_match_id;

  IF v_filled >= 4 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'match_full',
      'error', 'El partido ya está completo',
      'remaining', 0
    );
  END IF;

  IF p_slot_index IS NOT NULL AND p_slot_index >= 0 AND p_slot_index <= 3 THEN
    SELECT EXISTS (
      SELECT 1 FROM match_players
      WHERE match_id = p_match_id AND slot_index = p_slot_index
    ) INTO v_slot_taken;
    IF v_slot_taken THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'slot_taken',
        'error', 'Esa plaza ya está ocupada',
        'remaining', GREATEST(0, 4 - v_filled)
      );
    END IF;
  END IF;

  -- Solo pagos en curso recientes (evita bloquear plazas por intents abandonados).
  SELECT COUNT(DISTINCT pt.payer_player_id)::integer INTO v_in_flight
  FROM payment_transactions pt
  WHERE pt.booking_id = p_booking_id
    AND pt.status IN ('requires_action', 'processing')
    AND pt.created_at > NOW() - INTERVAL '30 minutes'
    AND pt.payer_player_id IS DISTINCT FROM p_player_id
    AND NOT EXISTS (
      SELECT 1 FROM match_players mp
      WHERE mp.match_id = p_match_id AND mp.player_id = pt.payer_player_id
    );

  IF v_filled + v_in_flight >= 4 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'match_full',
      'error', 'El partido ya no tiene plazas (otros jugadores están pagando)',
      'remaining', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'remaining', 4 - v_filled - v_in_flight
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_guest_join_payment_intent(
  p_booking_id uuid,
  p_match_id uuid,
  p_player_id uuid,
  p_stripe_pi_id text,
  p_amount_cents integer,
  p_currency text,
  p_slot_index smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check jsonb;
BEGIN
  v_check := public.assert_guest_can_join_match(
    p_match_id, p_booking_id, p_player_id, p_slot_index
  );

  IF COALESCE((v_check->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_check;
  END IF;

  IF (v_check->>'code') = 'already_in_match' THEN
    RETURN v_check;
  END IF;

  INSERT INTO payment_transactions (
    booking_id,
    payer_player_id,
    amount_cents,
    currency,
    stripe_payment_intent_id,
    status
  ) VALUES (
    p_booking_id,
    p_player_id,
    p_amount_cents,
    UPPER(COALESCE(p_currency, 'EUR')),
    p_stripe_pi_id,
    'requires_action'
  )
  ON CONFLICT (stripe_payment_intent_id) DO UPDATE
    SET status = EXCLUDED.status,
        updated_at = NOW();

  RETURN jsonb_build_object('ok', true, 'remaining', v_check->'remaining');
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_guest_can_join_match(uuid, uuid, uuid, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_guest_join_payment_intent(uuid, uuid, uuid, text, integer, text, smallint) TO service_role;

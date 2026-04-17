-- Datos de prueba: jugadores testwebpadel1..12@gmail.com + inscripciones confirmadas.
-- 1) Reemplazá el UUID en v_tournament.
-- 2) Ejecutá en el SQL Editor de Supabase.
--
-- Requiere: max_players >= 12. pgcrypto para token_hash (create extension si falta).

create extension if not exists pgcrypto;

do $$
declare
  v_tournament uuid := '00000000-0000-0000-0000-000000000000';  -- <-- TU ID DE TORNEO
  v_mode text;
  v_max int;
  v_ttl int;
  v_gender text;
  v_elo_min int;
  v_elo_max int;
  v_player_gender text;
  v_elo double precision;
  v_now timestamptz := now();
  v_exp timestamptz;
  i int;
  p1 uuid;
  p2 uuid;
  emails text[] := array[
    'testwebpadel1@gmail.com','testwebpadel2@gmail.com','testwebpadel3@gmail.com','testwebpadel4@gmail.com',
    'testwebpadel5@gmail.com','testwebpadel6@gmail.com','testwebpadel7@gmail.com','testwebpadel8@gmail.com',
    'testwebpadel9@gmail.com','testwebpadel10@gmail.com','testwebpadel11@gmail.com','testwebpadel12@gmail.com'
  ];
begin
  if v_tournament = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Editá v_tournament con el UUID real del torneo.';
  end if;

  select registration_mode, max_players, invite_ttl_minutes, gender, elo_min, elo_max
    into v_mode, v_max, v_ttl, v_gender, v_elo_min, v_elo_max
  from public.tournaments where id = v_tournament;

  if v_mode is null then
    raise exception 'Torneo no encontrado: %', v_tournament;
  end if;

  if v_max < 12 then
    raise exception 'max_players (%) < 12; aumentá el cupo.', v_max;
  end if;

  v_exp := v_now + (greatest(1, coalesce(v_ttl, 1440)) || ' minutes')::interval;

  v_player_gender := case lower(coalesce(v_gender, ''))
    when 'male' then 'male'
    when 'female' then 'female'
    else 'any'
  end;

  for i in 1..12 loop
    v_elo := case
      when v_elo_min is not null and v_elo_max is not null and v_elo_min <= v_elo_max then
        least(v_elo_max::double precision, greatest(v_elo_min::double precision,
          v_elo_min::double precision + ((i - 1) % 5) * ((v_elo_max - v_elo_min)::double precision / 4.0)))
      else 3.5 + ((i - 1) % 5) * 0.25
    end;

    insert into public.players (
      first_name, last_name, email, status, elo_rating, gender, onboarding_completed
    ) values (
      'Test', 'WebPadel ' || i, emails[i], 'active', v_elo, v_player_gender, true
    )
    on conflict (email) do update set
      elo_rating = excluded.elo_rating,
      gender = excluded.gender,
      onboarding_completed = true,
      updated_at = v_now;
  end loop;

  if v_mode = 'pair' then
    for i in 0..5 loop
      select id into p1 from public.players where email = emails[i * 2 + 1];
      select id into p2 from public.players where email = emails[i * 2 + 2];
      if not exists (
        select 1 from public.tournament_inscriptions
        where tournament_id = v_tournament and status = 'confirmed'
          and player_id_1 = p1 and player_id_2 = p2
      ) then
        insert into public.tournament_inscriptions (
          tournament_id, status, invited_at, expires_at, confirmed_at,
          player_id_1, player_id_2, token_hash
        ) values (
          v_tournament, 'confirmed', v_now, v_exp, v_now, p1, p2,
          encode(digest(v_tournament::text || ':pair:' || i::text || p1::text || p2::text, 'sha256'), 'hex')
        );
      end if;
    end loop;
  else
    for i in 1..12 loop
      select id into p1 from public.players where email = emails[i];
      update public.tournament_inscriptions
      set status = 'confirmed', confirmed_at = coalesce(confirmed_at, v_now), updated_at = v_now, player_id_2 = null
      where tournament_id = v_tournament and player_id_1 = p1;

      if not exists (
        select 1 from public.tournament_inscriptions
        where tournament_id = v_tournament and player_id_1 = p1
      ) then
        insert into public.tournament_inscriptions (
          tournament_id, status, invited_at, expires_at, confirmed_at,
          player_id_1, player_id_2, token_hash
        ) values (
          v_tournament, 'confirmed', v_now, v_exp, v_now, p1, null,
          encode(digest(v_tournament::text || ':ind:' || i::text || p1::text, 'sha256'), 'hex')
        );
      end if;
    end loop;
  end if;

  -- Alinear estado con cupo (similar a refreshTournamentStatus; ignora registration_closed_at)
  update public.tournaments t
  set
    status = case
      when (
        select coalesce(sum(case when ti.player_id_2 is null then 1 else 2 end), 0)
        from public.tournament_inscriptions ti
        where ti.tournament_id = v_tournament and ti.status = 'confirmed'
      ) >= t.max_players then 'closed'::text
      else 'open'::text
    end,
    closed_at = case
      when (
        select coalesce(sum(case when ti.player_id_2 is null then 1 else 2 end), 0)
        from public.tournament_inscriptions ti
        where ti.tournament_id = v_tournament and ti.status = 'confirmed'
      ) >= t.max_players then coalesce(t.closed_at, v_now)
      else null
    end,
    updated_at = v_now
  where t.id = v_tournament;
end $$;

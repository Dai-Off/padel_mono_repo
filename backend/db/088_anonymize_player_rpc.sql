-- RPC transaccional para anonimización: invocada desde el backend vía supabase.rpc() (sin conexión pg directa).

create or replace function public.anonymize_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_status text;
  v_anon_email text;
  v_anon_username text;
  v_deleted_name text := 'Usuario eliminado';
  v_deleted_message text := '[eliminado]';
begin
  select auth_user_id, status
  into v_auth_user_id, v_status
  from public.players
  where id = p_player_id
  for update;

  if not found then
    raise exception 'player_not_found';
  end if;

  if v_status = 'deleted' then
    return;
  end if;

  v_anon_email := 'deleted_' || replace(p_player_id::text, '-', '') || '@deleted.local';
  v_anon_username := 'deleted_' || left(replace(p_player_id::text, '-', ''), 24);

  update public.players set
    email = v_anon_email,
    first_name = v_deleted_name,
    last_name = '',
    phone = null,
    username = v_anon_username,
    birth_date = null,
    profile_description = null,
    play_location = null,
    gender = null,
    avatar_url = null,
    cover_url = null,
    stripe_customer_id = null,
    consents = '{}'::jsonb,
    status = 'deleted',
    deletion_requested_at = null,
    deleted_at = now(),
    updated_at = now()
  where id = p_player_id;

  update public.player_direct_messages
  set body = v_deleted_message
  where sender_player_id = p_player_id or recipient_player_id = p_player_id;

  update public.club_reviews
  set comment = null, updated_at = now()
  where player_id = p_player_id;

  update public.match_feedback
  set comment = null, would_not_repeat_reason = null
  where reviewer_id = p_player_id;

  update public.onboarding_answers
  set answers = '{}'::jsonb
  where player_id = p_player_id;

  if v_auth_user_id is not null then
    update public.tournament_chat_messages
    set author_name = v_deleted_name, message = v_deleted_message
    where author_user_id = v_auth_user_id;

    begin
      update public.booking_chat_messages
      set author_name = v_deleted_name, message = v_deleted_message
      where author_user_id = v_auth_user_id;
    exception when undefined_table then
      null;
    end;
  end if;

  begin
    update public.community_posts
    set caption = null, location = null
    where player_id = p_player_id;
  exception when undefined_table then
    null;
  end;

  begin
    update public.community_comments
    set content = v_deleted_message
    where player_id = p_player_id;
  exception when undefined_table then
    null;
  end;

  begin
    update public.coach_assessments
    set answers = '{}'::jsonb
    where player_id = p_player_id;
  exception when undefined_table then
    null;
  end;

  delete from public.matchmaking_pool where player_id = p_player_id;

  /*
   * PRESERVED (legal / fiscal): payment_transactions, store_orders, wallet_transactions,
   * bookings, matches, match_players, score_submissions, league/learning history.
   */
end;
$$;

comment on function public.anonymize_player(uuid) is
  'Anonymizes player PII in one transaction. Called by backend account-deletion job via Supabase RPC.';

grant execute on function public.anonymize_player(uuid) to service_role;

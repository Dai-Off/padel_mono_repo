-- Preferencias de juego del perfil (sin ubicación)

alter table public.players
  add column if not exists preferred_side text not null default 'both'
    check (preferred_side in ('right', 'left', 'both')),
  add column if not exists preferred_schedule_slots text[] not null default '{}'::text[],
  add column if not exists preferred_days text[] not null default '{}'::text[],
  add column if not exists preferred_play_style text not null default 'balanced'
    check (preferred_play_style in ('competitive', 'social', 'learning', 'balanced')),
  add column if not exists preferred_match_duration_min integer not null default 90
    check (preferred_match_duration_min in (60, 90, 120)),
  add column if not exists preferred_partner_level text not null default 'any'
    check (preferred_partner_level in ('similar', 'higher', 'lower', 'any')),
  add column if not exists favorite_clubs text[] not null default '{}'::text[],
  add column if not exists notif_new_matches boolean not null default true,
  add column if not exists notif_tournament_reminders boolean not null default true,
  add column if not exists notif_class_updates boolean not null default true,
  add column if not exists notif_chat_messages boolean not null default true;

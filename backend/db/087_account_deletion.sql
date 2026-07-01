-- Account deletion: soft-delete + anonymization (GDPR / PIPL)
-- Identity lives in public.players (+ Supabase auth.users), not a separate users table.

alter table public.players
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.players drop constraint if exists players_status_check;
alter table public.players
  add constraint players_status_check
  check (status in ('active', 'blocked', 'pending_deletion', 'deleted'));

comment on column public.players.deletion_requested_at is
  'When the player requested account deletion; anonymization runs after grace period.';
comment on column public.players.deleted_at is
  'When PII was anonymized and status became deleted.';

create table if not exists public.deletion_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id),
  auth_user_id uuid,
  event_type text not null
    check (event_type in ('request', 'cancel', 'completed', 'failed')),
  requested_at timestamptz,
  processed_at timestamptz not null default now(),
  reason text,
  error_message text
);

create index if not exists idx_deletion_log_player
  on public.deletion_log (player_id, processed_at desc);

create index if not exists idx_players_pending_deletion
  on public.players (deletion_requested_at)
  where status = 'pending_deletion';

comment on table public.deletion_log is
  'Audit trail for account deletion (no PII). player_id retained for operational correlation.';

-- Matchmaking: deadline for confirm/pay; player sex for mixed preference validation.

alter table public.matches
  add column if not exists matchmaking_confirm_deadline_at timestamptz;

comment on column public.matches.matchmaking_confirm_deadline_at is
  'Hasta cuándo los 4 jugadores deben confirmar y pagar (matchmaking).';

alter table public.players
  add column if not exists sex text;

do $$ begin
  alter table public.players
    add constraint players_sex_chk check (sex is null or sex in ('male', 'female'));
exception when duplicate_object then null;
end $$;

comment on column public.players.sex is
  'Sexo biológico del jugador (male/female), para emparejar partidos mixed; distinto de preferencia en matchmaking_pool.';

alter table public.tournaments
  drop constraint if exists tournaments_registration_mode_check;

alter table public.tournaments
  add constraint tournaments_registration_mode_check
  check (registration_mode in ('individual', 'pair', 'both'));

-- Tournament visibility: public/private

alter table public.tournaments
  add column if not exists visibility text not null default 'private'
    check (visibility in ('public', 'private'));

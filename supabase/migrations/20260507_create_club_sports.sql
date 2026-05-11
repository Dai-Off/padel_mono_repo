create table if not exists public.club_sports (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  slug text not null,
  allows_singles boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, slug)
);

create index if not exists idx_club_sports_club_id on public.club_sports(club_id);

create or replace function public.set_club_sports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_club_sports_updated_at on public.club_sports;
create trigger trg_club_sports_updated_at
before update on public.club_sports
for each row
execute procedure public.set_club_sports_updated_at();

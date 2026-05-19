-- Tarifas de clases particulares por profesor (staff) además de tarifa general del club.

alter table public.club_school_fee_rules
  add column if not exists staff_id uuid null references public.club_staff(id) on delete cascade;

alter table public.club_school_fee_rules
  drop constraint if exists club_school_fee_rules_club_id_group_size_time_band_key;

drop index if exists public.uq_school_fee_rules_club_default;
create unique index uq_school_fee_rules_club_default
  on public.club_school_fee_rules (club_id, group_size, time_band)
  where staff_id is null;

drop index if exists public.uq_school_fee_rules_staff;
create unique index uq_school_fee_rules_staff
  on public.club_school_fee_rules (club_id, staff_id, group_size, time_band)
  where staff_id is not null;

create index if not exists idx_school_fee_rules_staff on public.club_school_fee_rules(staff_id);

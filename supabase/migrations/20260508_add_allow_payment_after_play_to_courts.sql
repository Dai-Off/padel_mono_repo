alter table public.courts
add column if not exists allow_payment_after_play boolean not null default false;

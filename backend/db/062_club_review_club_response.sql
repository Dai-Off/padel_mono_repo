-- Respuesta del club a una reseña de jugador.

alter table public.club_reviews
  add column if not exists club_response text,
  add column if not exists club_response_at timestamptz,
  add column if not exists club_response_by uuid references public.club_staff(id) on delete set null;

comment on column public.club_reviews.club_response is 'Texto de respuesta pública del club a la reseña del jugador.';
comment on column public.club_reviews.club_response_at is 'Momento en que el club publicó o actualizó la respuesta.';
comment on column public.club_reviews.club_response_by is 'Miembro del staff que escribió la respuesta (portal o dueño).';

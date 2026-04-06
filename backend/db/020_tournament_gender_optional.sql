-- Hace opcional `gender` si venías de 019 antigua (NOT NULL DEFAULT 'mixed').
-- En instalaciones nuevas con 019 actualizado, este script es idempotente y no cambia el comportamiento.

alter table public.tournaments alter column gender drop default;
alter table public.tournaments alter column gender drop not null;

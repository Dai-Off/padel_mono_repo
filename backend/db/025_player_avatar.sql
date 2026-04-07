-- Perfil: URL pública de avatar (p. ej. Supabase Storage bucket player-avatars).
alter table public.players add column if not exists avatar_url text;

-- Bucket público de lectura; escritura solo en carpeta {auth.uid()}/...
-- (Límite de tamaño y MIME se pueden afinar en el panel de Supabase Storage.)
insert into storage.buckets (id, name, public)
values ('player-avatars', 'player-avatars', true)
on conflict (id) do nothing;

drop policy if exists "player_avatars_public_read" on storage.objects;
create policy "player_avatars_public_read"
on storage.objects for select
using (bucket_id = 'player-avatars');

drop policy if exists "player_avatars_insert_own" on storage.objects;
create policy "player_avatars_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'player-avatars'
  and auth.role() = 'authenticated'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "player_avatars_update_own" on storage.objects;
create policy "player_avatars_update_own"
on storage.objects for update
using (
  bucket_id = 'player-avatars'
  and auth.role() = 'authenticated'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "player_avatars_delete_own" on storage.objects;
create policy "player_avatars_delete_own"
on storage.objects for delete
using (
  bucket_id = 'player-avatars'
  and auth.role() = 'authenticated'
  and split_part(name, '/', 1) = auth.uid()::text
);

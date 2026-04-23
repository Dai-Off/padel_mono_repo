-- Opcional: solo si aplicaste un 050 viejo sin la columna `elite_card_subtitle`.
-- ORDEN: primero `050_season_pass_content.sql` (crea `season_pass_seasons`). El 050 actual ya incluye esa columna → este script suele no hacer falta.
-- Si ejecutás 051 sin haber corrido 050, antes fallaba; ahora no hace nada.

do $$
begin
  if to_regclass('public.season_pass_seasons') is not null then
    alter table public.season_pass_seasons add column if not exists elite_card_subtitle text;
    update public.season_pass_seasons
    set elite_card_subtitle = coalesce(elite_card_subtitle, '+100 recompensas exclusivas')
    where slug = 's1';
  end if;
end $$;

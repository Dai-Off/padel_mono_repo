-- Las invitaciones de pareja se desacoplan de las preferencias de búsqueda:
-- las prefs se fijan al BUSCAR (start-search/accept-and-search), no al invitar.
-- Por eso `prefs` pasa a ser opcional.

alter table public.matchmaking_pair_invites alter column prefs drop not null;

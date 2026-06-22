-- Curva de LP para ascender por liga (100/125/150): subir cuesta más en ligas altas.
-- bronce sigue en 100 (arranque ágil), elite en null (no asciende). Solo cambian plata y oro.

update public.matchmaking_leagues set lps_to_promote = 125 where code = 'plata';
update public.matchmaking_leagues set lps_to_promote = 150 where code = 'oro';

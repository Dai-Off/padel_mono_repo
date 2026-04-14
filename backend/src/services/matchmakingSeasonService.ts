import type { SupabaseClient } from '@supabase/supabase-js';
import { leagueIndex } from './matchmakingLeague';

/** Asigna la temporada MM activa si el jugador aún no tiene una (registro / migraciones). */
export async function assignActiveMatchmakingSeasonIfNull(
  supabase: SupabaseClient,
  playerId: string,
): Promise<void> {
  try {
    const sid = await getActiveMatchmakingSeasonId(supabase);
    if (!sid) return;
    await supabase.from('players').update({ league_season_id: sid }).eq('id', playerId).is('league_season_id', null);
  } catch {
    /* tabla matchmaking_seasons ausente o sin temporada activa */
  }
}

export async function getActiveMatchmakingSeasonId(supabase: SupabaseClient): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('matchmaking_seasons')
    .select('id')
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id?: string } | null)?.id ?? null;
}

export type CloseSeasonResult = { closed_season_id: string; new_season_id: string; players_archived: number };

function highestLigaSnapshot(peak: string | null, liga: string): string {
  if (!peak) return liga;
  return leagueIndex(peak) >= leagueIndex(liga) ? peak : liga;
}

/**
 * Cierra la temporada MM activa: archiva en `player_league_history`, resetea LP y pico de temporada.
 */
export async function closeActiveMatchmakingSeason(
  supabase: SupabaseClient,
  newSeasonName?: string,
): Promise<CloseSeasonResult> {
  const activeId = await getActiveMatchmakingSeasonId(supabase);
  if (!activeId) throw new Error('No hay temporada de matchmaking activa');

  const nowIso = new Date().toISOString();
  const name =
    newSeasonName?.trim() ||
    `Temporada ${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;

  const { error: e0 } = await supabase.from('matchmaking_seasons').update({ ends_at: nowIso }).eq('id', activeId);
  if (e0) throw new Error(e0.message);

  const { data: inserted, error: e1 } = await supabase
    .from('matchmaking_seasons')
    .insert({ name, starts_at: nowIso, ends_at: '2099-12-31T23:59:59.000Z' })
    .select('id')
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  const newId = (inserted as { id: string }).id;

  const pageSize = 200;
  let from = 0;
  let archived = 0;

  for (;;) {
    const { data: batch, error: e2 } = await supabase
      .from('players')
      .select('id, liga, lps, mm_peak_liga')
      .eq('league_season_id', activeId)
      .order('id')
      .range(from, from + pageSize - 1);
    if (e2) throw new Error(e2.message);
    const list = (batch ?? []) as { id: string; liga: string; lps: number; mm_peak_liga: string | null }[];
    if (!list.length) break;

    const historyRows = list.map((p) => ({
      player_id: p.id,
      season_id: activeId,
      liga: p.liga,
      final_lps: p.lps,
      highest_liga: highestLigaSnapshot(p.mm_peak_liga, p.liga),
    }));

    const { error: e3 } = await supabase.from('player_league_history').insert(historyRows);
    if (e3) throw new Error(e3.message);

    for (const p of list) {
      const { error: e4 } = await supabase
        .from('players')
        .update({
          lps: 0,
          league_season_id: newId,
          mm_shield_matches: 0,
          mm_peak_liga: p.liga,
          updated_at: nowIso,
        })
        .eq('id', p.id);
      if (e4) throw new Error(e4.message);
    }

    archived += list.length;
    from += pageSize;
    if (list.length < pageSize) break;
  }

  const { error: e6 } = await supabase
    .from('players')
    .update({
      league_season_id: newId,
      lps: 0,
      mm_shield_matches: 0,
      updated_at: nowIso,
    })
    .is('league_season_id', null);
  if (e6) throw new Error(e6.message);

  return { closed_season_id: activeId, new_season_id: newId, players_archived: archived };
}

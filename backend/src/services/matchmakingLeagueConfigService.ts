import type { SupabaseClient } from '@supabase/supabase-js';

export type MatchmakingLeagueConfigRow = {
  code: string;
  sort_order: number;
  label: string;
  elo_min: number;
  elo_max: number;
  lps_to_promote: number | null;
};

const DEFAULT_ROWS: MatchmakingLeagueConfigRow[] = [
  { code: 'bronce', sort_order: 0, label: 'Bronce', elo_min: 0, elo_max: 2, lps_to_promote: 100 },
  { code: 'plata', sort_order: 1, label: 'Plata', elo_min: 2, elo_max: 4, lps_to_promote: 100 },
  { code: 'oro', sort_order: 2, label: 'Oro', elo_min: 4, elo_max: 5.5, lps_to_promote: 100 },
  { code: 'elite', sort_order: 3, label: 'Elite', elo_min: 5.5, elo_max: 20, lps_to_promote: null },
];

let cache: MatchmakingLeagueConfigRow[] | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

export function invalidateMatchmakingLeagueConfigCache(): void {
  cache = null;
  cacheAt = 0;
}

export async function getMatchmakingLeagueConfigRows(
  supabase: SupabaseClient,
): Promise<MatchmakingLeagueConfigRow[]> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const { data, error } = await supabase
    .from('matchmaking_leagues')
    .select('code, sort_order, label, elo_min, elo_max, lps_to_promote')
    .order('sort_order', { ascending: true });
  if (error || !data?.length) {
    cache = DEFAULT_ROWS;
    cacheAt = Date.now();
    return DEFAULT_ROWS;
  }
  cache = data as MatchmakingLeagueConfigRow[];
  cacheAt = Date.now();
  return cache;
}

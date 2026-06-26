import { API_URL } from '../config';

// ─── Historial de evolución del nivel (ELO) ───
export type LevelHistoryPlayer = {
  id: string | null;
  initials: string;
  avatarUrl: string | null;
};

export type LevelHistoryMatch = {
  matchId: string;
  playedAt: string | null;
  result: 'win' | 'loss' | 'draw';
  ratingChange: number;
  eloAfter: number;
  myTeam: 'A' | 'B';
  scoreA: number[];
  scoreB: number[];
  teamA: LevelHistoryPlayer[];
  teamB: LevelHistoryPlayer[];
};

export type LevelHistory = {
  currentElo: number;
  matches: LevelHistoryMatch[];
};

export type LevelHistoryLimit = '5' | '10' | 'all';

type LevelHistoryResponse = {
  ok?: boolean;
  current_elo?: number;
  matches?: {
    match_id: string;
    played_at: string | null;
    result: string;
    rating_change: number;
    elo_after: number;
    my_team: 'A' | 'B';
    score_a: number[];
    score_b: number[];
    team_a: { id: string | null; initials: string; avatarUrl: string | null }[];
    team_b: { id: string | null; initials: string; avatarUrl: string | null }[];
  }[];
  error?: string;
};

function mapResult(raw: string): 'win' | 'loss' | 'draw' {
  return raw === 'win' || raw === 'loss' ? raw : 'draw';
}

/** Historial de ELO del jugador autenticado (partidos de matchmaking). */
export async function fetchLevelHistory(
  token: string | null | undefined,
  limit: LevelHistoryLimit = '5',
): Promise<LevelHistory | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me/level-history?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as LevelHistoryResponse;
    if (!res.ok || !json.ok) return null;
    return {
      currentElo: Number(json.current_elo ?? 0),
      matches: (json.matches ?? []).map((m) => ({
        matchId: m.match_id,
        playedAt: m.played_at,
        result: mapResult(m.result),
        ratingChange: Number(m.rating_change ?? 0),
        eloAfter: Number(m.elo_after ?? 0),
        myTeam: m.my_team,
        scoreA: m.score_a ?? [],
        scoreB: m.score_b ?? [],
        teamA: m.team_a ?? [],
        teamB: m.team_b ?? [],
      })),
    };
  } catch {
    return null;
  }
}

// ─── Estadísticas del jugador ───
export type PlayerStats = {
  winStreak: number;
  lossStreak: number;
  totalWins: number;
  totalLosses: number;
  /** Total de partidos con resultado decidido (ganados + perdidos). */
  totalMatches: number;
  recentN: number;
  recentWins: number;
  winRateLast8: number;
  eloRating: number | null;
  fiabilidad: number;
};

type StatsResponse = {
  ok?: boolean;
  win_streak?: number;
  loss_streak?: number;
  total_wins?: number;
  total_losses?: number;
  recent_n?: number;
  recent_wins?: number;
  win_rate_last_8?: number;
  elo_rating?: number | null;
  fiabilidad?: number;
  error?: string;
};

/** Estadísticas agregadas de un jugador (para la tarjeta "Estadísticas"). */
export async function fetchPlayerStats(
  token: string | null | undefined,
  playerId: string,
): Promise<PlayerStats | null> {
  if (!token || !playerId) return null;
  try {
    const res = await fetch(`${API_URL}/players/${playerId}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as StatsResponse;
    if (!res.ok || !json.ok) return null;
    const totalWins = Number(json.total_wins ?? 0);
    const totalLosses = Number(json.total_losses ?? 0);
    return {
      winStreak: Number(json.win_streak ?? 0),
      lossStreak: Number(json.loss_streak ?? 0),
      totalWins,
      totalLosses,
      totalMatches: totalWins + totalLosses,
      recentN: Number(json.recent_n ?? 0),
      recentWins: Number(json.recent_wins ?? 0),
      winRateLast8: Number(json.win_rate_last_8 ?? 0),
      eloRating: json.elo_rating ?? null,
      fiabilidad: Number(json.fiabilidad ?? 0),
    };
  } catch {
    return null;
  }
}

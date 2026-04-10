import { apiFetchWithAuth } from './api';

export type LeaguePlayer = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  elo_rating?: number;
  avatar_url?: string;
};

export type LeagueEntry = {
  id: string;
  division_id: string;
  name: string;
  sort_order: number;
  player_id_1: string | null;
  player_id_2: string | null;
  player1: LeaguePlayer | null;
  player2: LeaguePlayer | null;
};

export type LeagueDivision = {
  id: string;
  season_id: string;
  name: string;
  sort_order: number;
  promote_count: number;
  relegate_count: number;
  elo_min: number | null;
  elo_max: number | null;
  league_teams?: LeagueEntry[];
};

export type LeagueMatch = {
  id: string;
  season_id: string;
  division_id: string;
  entry_a_id: string;
  entry_b_id: string;
  booking_id: string | null;
  round_number: number;
  status: 'scheduled' | 'confirmed' | 'played' | 'cancelled';
  winner_entry_id: string | null;
  sets: Array<{ games_a: number; games_b: number }> | null;
  scheduled_at: string | null;
  played_at: string | null;
  entry_a?: { id: string; team_label: string; player_id_1: string | null; player_id_2: string | null } | null;
  entry_b?: { id: string; team_label: string; player_id_1: string | null; player_id_2: string | null } | null;
};

export type LeagueSeason = {
  id: string;
  club_id: string;
  name: string;
  closed: boolean;
  mode: 'individual' | 'pairs';
  created_at: string;
  updated_at: string;
  league_divisions?: LeagueDivision[];
};

export const leaguesService = {
  async listSeasons(clubId: string): Promise<LeagueSeason[]> {
    const res = await apiFetchWithAuth<{ ok: boolean; seasons?: LeagueSeason[] }>(
      `/leagues/seasons?club_id=${encodeURIComponent(clubId)}`
    );
    return Array.isArray(res.seasons) ? res.seasons : [];
  },

  async createSeason(clubId: string, name: string, mode: 'individual' | 'pairs', divisions?: Array<{ label: string; elo_min?: number | null; elo_max?: number | null; promote_count?: number; relegate_count?: number }>): Promise<void> {
    await apiFetchWithAuth('/leagues/seasons', {
      method: 'POST',
      body: JSON.stringify({ club_id: clubId, name, mode, divisions }),
    });
  },

  async addEntry(seasonId: string, divisionId: string, playerId1: string, playerId2?: string | null): Promise<LeagueEntry> {
    const res = await apiFetchWithAuth<{ ok: boolean; entry: LeagueEntry }>(
      `/leagues/seasons/${seasonId}/entries`,
      {
        method: 'POST',
        body: JSON.stringify({ division_id: divisionId, player_id_1: playerId1, player_id_2: playerId2 || undefined }),
      }
    );
    return res.entry;
  },

  async removeEntry(entryId: string): Promise<void> {
    await apiFetchWithAuth(`/leagues/entries/${entryId}`, { method: 'DELETE' });
  },

  async listMatches(seasonId: string): Promise<LeagueMatch[]> {
    const res = await apiFetchWithAuth<{ ok: boolean; matches?: LeagueMatch[] }>(
      `/leagues/seasons/${seasonId}/matches`
    );
    return Array.isArray(res.matches) ? res.matches : [];
  },

  async createMatch(seasonId: string, payload: {
    division_id: string;
    entry_a_id: string;
    entry_b_id: string;
    round_number?: number;
    booking_id?: string | null;
    scheduled_at?: string | null;
  }): Promise<LeagueMatch> {
    const res = await apiFetchWithAuth<{ ok: boolean; match: LeagueMatch }>(
      `/leagues/seasons/${seasonId}/matches`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return res.match;
  },

  async submitResult(matchId: string, winnerEntryId: string, sets: Array<{ games_a: number; games_b: number }>): Promise<void> {
    await apiFetchWithAuth(`/leagues/matches/${matchId}/result`, {
      method: 'POST',
      body: JSON.stringify({ winner_entry_id: winnerEntryId, sets }),
    });
  },

  async closeAndPromote(seasonId: string): Promise<{ moved: number }> {
    const res = await apiFetchWithAuth<{ ok: boolean; moved?: number }>(
      `/leagues/seasons/${seasonId}/close-and-promote`,
      { method: 'POST' }
    );
    return { moved: Number(res.moved ?? 0) };
  },
};

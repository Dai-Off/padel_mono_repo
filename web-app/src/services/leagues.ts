import { apiFetchWithAuth } from './api';

export type LeagueTeam = {
  id: string;
  division_id: string;
  name: string;
  sort_order: number;
  created_at?: string;
};

export type LeagueDivision = {
  id: string;
  season_id: string;
  name: string;
  sort_order: number;
  promote_count: number;
  relegate_count: number;
  league_teams?: LeagueTeam[];
};

export type LeagueSeason = {
  id: string;
  club_id: string;
  name: string;
  closed: boolean;
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

  async createSeason(clubId: string, name: string): Promise<void> {
    await apiFetchWithAuth('/leagues/seasons', {
      method: 'POST',
      body: JSON.stringify({ club_id: clubId, name }),
    });
  },

  async addTeam(seasonId: string, divisionId: string, name: string): Promise<void> {
    await apiFetchWithAuth(`/leagues/seasons/${seasonId}/teams`, {
      method: 'POST',
      body: JSON.stringify({ division_id: divisionId, name }),
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

import { apiFetchWithAuth } from './api';

export type TournamentPrize = { label: string; amount_cents: number };

export type TournamentListItem = {
  id: string;
  club_id: string;
  name?: string | null;
  start_at: string;
  end_at: string;
  duration_min: number;
  price_cents: number;
  prize_total_cents?: number;
  /** Premios por puesto (campeón, subcampeón, etc.). Vacío si solo hay bolsa legacy. */
  prizes?: TournamentPrize[] | null;
  currency: string;
  elo_min: number | null;
  elo_max: number | null;
  max_players: number;
  registration_mode: 'individual' | 'pair';
  registration_closed_at: string | null;
  cancellation_cutoff_at: string | null;
  invite_ttl_minutes: number;
  status: 'open' | 'closed' | 'cancelled';
  visibility?: 'public' | 'private';
  /** Opcional. null/sin valor = sin filtro por género. male, female, mixed = categoría explícita. */
  gender?: 'male' | 'female' | 'mixed' | null;
  description: string | null;
  normas?: string | null;
  tournament_courts?: { court_id: string }[];
  confirmed_count?: number;
  pending_count?: number;
};

export type TournamentInscription = {
  id: string;
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled' | 'rejected';
  invited_at: string;
  expires_at: string;
  invite_email_1?: string | null;
  invite_email_2?: string | null;
  players_1?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    avatar_url?: string | null;
    elo_rating?: number | null;
  } | null;
  players_2?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    avatar_url?: string | null;
    elo_rating?: number | null;
  } | null;
};

type ListResponse = { ok: true; tournaments: TournamentListItem[] };
type DetailResponse = {
  ok: true;
  tournament: TournamentListItem;
  inscriptions: TournamentInscription[];
  counts: { confirmed: number; pending: number };
};

export type TournamentChatMessage = {
  id: string;
  created_at: string;
  author_user_id: string;
  author_name: string;
  message: string;
};

export type CompetitionFormat = 'single_elim' | 'group_playoff' | 'round_robin';
export type CompetitionSet = { games_a: number; games_b: number };
export type CompetitionTeam = {
  id: string;
  slot_index: number;
  name: string;
  status: 'active' | 'eliminated';
  player_id_1: string;
  player_id_2: string | null;
};
export type CompetitionStage = {
  id: string;
  stage_type: 'single_elim' | 'groups' | 'playoff' | 'round_robin';
  stage_name: string;
  stage_order: number;
};
export type CompetitionGroup = { id: string; stage_id: string; group_code: string };
export type CompetitionMatch = {
  id: string;
  stage_id: string;
  group_id: string | null;
  round_number: number;
  match_number: number;
  team_a_id: string | null;
  team_b_id: string | null;
  source_match_a_id?: string | null;
  source_match_b_id?: string | null;
  seed_label_a?: string | null;
  seed_label_b?: string | null;
  status: 'scheduled' | 'bye' | 'finished';
  winner_team_id: string | null;
  result?: { match_id: string; winner_team_id: string; sets: CompetitionSet[]; submitted_at: string } | null;
};
export type CompetitionPodiumRow = { position: number; team_id: string; note?: string | null };
export type CompetitionView = {
  tournament: {
    id: string;
    competition_format: CompetitionFormat | null;
    match_rules: { best_of_sets?: number; allow_draws?: boolean } | null;
    standings_rules: Record<string, unknown> | null;
    status: string;
    visibility: 'public' | 'private';
    prizes?: TournamentPrize[] | null;
  } | null;
  teams: CompetitionTeam[];
  stages: CompetitionStage[];
  groups: CompetitionGroup[];
  matches: CompetitionMatch[];
  standings: Record<string, Array<Record<string, unknown>>>;
  podium: Array<{ position: number; team_id: string; note: string | null }>;
};

export const tournamentsService = {
  async list(clubId: string): Promise<TournamentListItem[]> {
    const res = await apiFetchWithAuth<ListResponse>(`/tournaments?club_id=${encodeURIComponent(clubId)}`);
    return res.tournaments ?? [];
  },

  async detail(id: string): Promise<DetailResponse> {
    return apiFetchWithAuth<DetailResponse>(`/tournaments/${id}`);
  },

  async create(payload: Record<string, unknown>): Promise<TournamentListItem> {
    const res = await apiFetchWithAuth<{ ok: true; tournament: TournamentListItem }>(`/tournaments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.tournament;
  },

  async update(id: string, payload: Record<string, unknown>): Promise<TournamentListItem> {
    const res = await apiFetchWithAuth<{ ok: true; tournament: TournamentListItem }>(`/tournaments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.tournament;
  },

  async cancel(id: string, reason?: string): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async invite(tournamentId: string, invites: Array<{ email_1: string; email_2?: string }>): Promise<{ invite_urls: string[] }> {
    const res = await apiFetchWithAuth<{ ok: true; invite_urls?: string[] }>(`/tournaments/${tournamentId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ invites }),
    });
    return { invite_urls: res.invite_urls ?? [] };
  },

  async joinOwner(tournamentId: string): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/join-owner`, {
      method: 'POST',
    });
  },

  async addParticipant(tournamentId: string, playerId: string): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId }),
    });
  },

  async removeInscription(tournamentId: string, inscriptionId: string): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/inscriptions/${inscriptionId}`, {
      method: 'DELETE',
    });
  },

  /** Modo individual: intercambia jugadores entre dos inscripciones confirmadas (cambia emparejamientos). */
  async swapSingles(tournamentId: string, inscriptionIdA: string, inscriptionIdB: string): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/inscriptions/swap-singles`, {
      method: 'POST',
      body: JSON.stringify({ inscription_id_a: inscriptionIdA, inscription_id_b: inscriptionIdB }),
    });
  },

  /** Modo individual: reasigna qué jugador ocupa cada inscripción (permutación completa del estado actual). */
  async applySinglesPairing(
    tournamentId: string,
    assignments: Array<{ inscription_id: string; player_id: string }>
  ): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/inscriptions/singles-pairing`, {
      method: 'PUT',
      body: JSON.stringify({ assignments }),
    });
  },

  /** Modo parejas: asigna el segundo jugador cuando la pareja estaba incompleta. */
  async assignPartner(tournamentId: string, inscriptionId: string, playerId: string): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/inscriptions/${inscriptionId}/assign-partner`, {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId }),
    });
  },

  async listChat(tournamentId: string): Promise<TournamentChatMessage[]> {
    const res = await apiFetchWithAuth<{ ok: true; messages: TournamentChatMessage[] }>(`/tournaments/${tournamentId}/chat`);
    return res.messages ?? [];
  },

  async sendChat(tournamentId: string, message: string): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  async listPublic(clubId?: string): Promise<TournamentListItem[]> {
    const qs = clubId ? `?club_id=${encodeURIComponent(clubId)}` : '';
    const res = await apiFetchWithAuth<{ ok: true; tournaments: TournamentListItem[] }>(`/tournaments/public/list${qs}`);
    return res.tournaments ?? [];
  },

  async joinPublic(tournamentId: string): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/join`, {
      method: 'POST',
    });
  },

  async setupCompetition(
    tournamentId: string,
    payload: {
      format: CompetitionFormat;
      match_rules?: { best_of_sets?: number; allow_draws?: boolean };
      standings_rules?: Record<string, unknown>;
    }
  ): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/competition/setup`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async generateCompetition(tournamentId: string): Promise<{ teams_count: number; matches_count: number }> {
    const res = await apiFetchWithAuth<{ ok: true; teams_count: number; matches_count: number }>(
      `/tournaments/${tournamentId}/competition/generate`,
      { method: 'POST' }
    );
    return { teams_count: res.teams_count ?? 0, matches_count: res.matches_count ?? 0 };
  },

  async generateCompetitionManual(
    tournamentId: string,
    teamKeys: string[]
  ): Promise<{ teams_count: number; matches_count: number }> {
    const res = await apiFetchWithAuth<{ ok: true; teams_count: number; matches_count: number }>(
      `/tournaments/${tournamentId}/competition/generate-manual`,
      { method: 'POST', body: JSON.stringify({ team_keys: teamKeys }) }
    );
    return { teams_count: res.teams_count ?? 0, matches_count: res.matches_count ?? 0 };
  },

  async competitionAdminView(tournamentId: string): Promise<CompetitionView> {
    const res = await apiFetchWithAuth<{ ok: true } & CompetitionView>(`/tournaments/${tournamentId}/competition/admin-view`);
    return res;
  },

  async competitionPublicView(tournamentId: string): Promise<CompetitionView> {
    const res = await apiFetchWithAuth<{ ok: true } & CompetitionView>(`/tournaments/${tournamentId}/competition/public-view`);
    return res;
  },

  async saveMatchResult(
    tournamentId: string,
    matchId: string,
    payload: { sets: CompetitionSet[]; override?: boolean }
  ): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/matches/${matchId}/result`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async savePodium(tournamentId: string, podium: CompetitionPodiumRow[]): Promise<void> {
    await apiFetchWithAuth(`/tournaments/${tournamentId}/podium`, {
      method: 'PUT',
      body: JSON.stringify({ podium }),
    });
  },
};

import { apiFetchWithAuth } from './api';

export type TournamentPrize = { label: string; amount_cents: number };


export type TournamentListItem = {
  id: string;
  club_id: string;
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
  players_1?: { id: string; first_name: string; last_name: string; email: string | null } | null;
  players_2?: { id: string; first_name: string; last_name: string; email: string | null } | null;
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
};

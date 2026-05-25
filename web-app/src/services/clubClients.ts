import { apiFetchWithAuth, apiFetchBlobWithAuth } from './api';
import type { Player } from '../types/api';

type OkPlayers = { ok: true; players: Player[] };
type OkPlayer = { ok: true; player: Player };
type SendEmailResult = {
  ok: true;
  sent_count: number;
  failed_count: number;
  results: { to: string; ok: boolean; error?: string; player_id?: string }[];
};

export type ClubClientTier = 'vip' | 'premium' | 'standard' | 'basic';
export type ClubClientFilters = {
  q?: string;
  tier?: ClubClientTier;
  elo_min?: number;
  elo_max?: number;
  created_from?: string; // ISO or yyyy-mm-dd (backend accepts ISO-ish)
  created_to?: string; // ISO or yyyy-mm-dd
  has_wallet?: boolean;
  has_wallet_balance?: boolean;
  /** Saldo mínimo en céntimos (puede ser negativo para incluir deudores). */
  balance_min_cents?: number;
  /** Saldo máximo en céntimos. */
  balance_max_cents?: number;
  has_school?: boolean;
  bookings_min?: number;
  bookings_max?: number;
  bookings_from?: string;
  bookings_to?: string;
  /** Solo clientes con reserva en curso o futura no cancelada en el club. */
  has_current_booking?: boolean;
  /** Solo clientes inscritos en algún torneo activo del club. */
  has_tournament?: boolean;
};

function buildQs(clubId: string, filters?: string | ClubClientFilters): URLSearchParams {
  const qs = new URLSearchParams({ club_id: clubId });
  if (!filters) return qs;
  if (typeof filters === 'string') {
    if (filters.trim()) qs.set('q', filters.trim());
    return qs;
  }

  const f = filters;
  if (f.q?.trim()) qs.set('q', f.q.trim());
  if (f.tier) qs.set('tier', f.tier);
  if (typeof f.elo_min === 'number' && Number.isFinite(f.elo_min)) qs.set('elo_min', String(f.elo_min));
  if (typeof f.elo_max === 'number' && Number.isFinite(f.elo_max)) qs.set('elo_max', String(f.elo_max));
  if (f.created_from?.trim()) qs.set('created_from', f.created_from.trim());
  if (f.created_to?.trim()) qs.set('created_to', f.created_to.trim());
  if (typeof f.has_wallet === 'boolean') qs.set('has_wallet', f.has_wallet ? '1' : '0');
  if (typeof f.has_wallet_balance === 'boolean') qs.set('has_wallet_balance', f.has_wallet_balance ? '1' : '0');
  if (typeof f.balance_min_cents === 'number' && Number.isFinite(f.balance_min_cents)) qs.set('balance_min_cents', String(f.balance_min_cents));
  if (typeof f.balance_max_cents === 'number' && Number.isFinite(f.balance_max_cents)) qs.set('balance_max_cents', String(f.balance_max_cents));
  if (typeof f.has_school === 'boolean') qs.set('has_school', f.has_school ? '1' : '0');
  if (typeof f.bookings_min === 'number' && Number.isFinite(f.bookings_min)) qs.set('bookings_min', String(f.bookings_min));
  if (typeof f.bookings_max === 'number' && Number.isFinite(f.bookings_max)) qs.set('bookings_max', String(f.bookings_max));
  if (f.bookings_from?.trim()) qs.set('bookings_from', f.bookings_from.trim());
  if (f.bookings_to?.trim()) qs.set('bookings_to', f.bookings_to.trim());
  if (typeof f.has_current_booking === 'boolean') qs.set('has_current_booking', f.has_current_booking ? '1' : '0');
  if (typeof f.has_tournament === 'boolean') qs.set('has_tournament', f.has_tournament ? '1' : '0');
  return qs;
}

export const clubClientService = {
  async list(clubId: string, filters?: string | ClubClientFilters): Promise<Player[]> {
    const qs = buildQs(clubId, filters);
    const res = await apiFetchWithAuth<OkPlayers>(`/club-clients?${qs.toString()}`);
    return res.players ?? [];
  },

  async exportCsv(clubId: string, filters?: string | ClubClientFilters): Promise<Blob> {
    const qs = buildQs(clubId, filters);
    return apiFetchBlobWithAuth(`/club-clients/export?${qs.toString()}`);
  },

  async createManual(data: {
    club_id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email?: string | null;
    username?: string | null;
  }): Promise<Player> {
    const res = await apiFetchWithAuth<OkPlayer>('/club-clients/manual', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.player;
  },

  async update(
    playerId: string,
    body: {
      club_id: string;
      first_name?: string;
      last_name?: string;
      email?: string | null;
      phone?: string | null;
      username?: string | null;
      elo_rating?: number;
      status?: Player['status'];
    }
  ): Promise<Player> {
    const res = await apiFetchWithAuth<OkPlayer>(`/club-clients/${playerId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.player;
  },

  async sendEmail(payload: {
    club_id: string;
    subject: string;
    body_html: string;
    mode: 'selected' | 'all';
    player_ids?: string[];
  }): Promise<SendEmailResult> {
    return apiFetchWithAuth<SendEmailResult>('/club-clients/send-email', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

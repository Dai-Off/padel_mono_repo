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

export const clubClientService = {
  async list(clubId: string, q?: string): Promise<Player[]> {
    const qs = new URLSearchParams({ club_id: clubId });
    if (q?.trim()) qs.set('q', q.trim());
    const res = await apiFetchWithAuth<OkPlayers>(`/club-clients?${qs.toString()}`);
    return res.players ?? [];
  },

  async exportCsv(clubId: string, q?: string): Promise<Blob> {
    const qs = new URLSearchParams({ club_id: clubId });
    if (q?.trim()) qs.set('q', q.trim());
    return apiFetchBlobWithAuth(`/club-clients/export?${qs.toString()}`);
  },

  async createManual(data: {
    club_id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email?: string | null;
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

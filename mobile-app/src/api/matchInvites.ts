import { API_URL } from '../config';
import type { PlayerSearchHit } from './players';

export type MatchInviteRow = {
  id: string;
  match_id: string;
  slot_index: number | null;
  invite_email: string;
  invited_player_id?: string | null;
  status: string;
  invited_at?: string;
  expires_at?: string;
  accepted_at?: string | null;
  joined_slot_index?: number | null;
  can_resend?: boolean;
  can_revoke?: boolean;
  can_dismiss?: boolean;
  players?: {
    id?: string;
    first_name?: string;
    last_name?: string;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
};

export type ReceivedMatchInvite = {
  id: string;
  match_id: string;
  slot_index: number;
  status: string;
  invited_at?: string;
  expires_at?: string;
  inviter_name: string;
  inviter_avatar_url?: string | null;
  club_name: string;
  court_name?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  has_schedule_conflict?: boolean;
  match_when: string;
  match_visibility?: 'public' | 'private' | string;
  match_competitive?: boolean;
};

export async function fetchMatchInvites(
  matchId: string,
  token: string | null | undefined,
): Promise<
  | { ok: true; invites: MatchInviteRow[]; capacity_remaining?: number }
  | { ok: false; error: string }
> {
  if (!token) return { ok: false, error: 'Inicia sesión para continuar' };
  try {
    const res = await fetch(`${API_URL}/matches/${encodeURIComponent(matchId)}/invites`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      invites?: MatchInviteRow[];
      capacity_remaining?: number;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudieron cargar las invitaciones' };
    }
    return { ok: true, invites: json.invites ?? [], capacity_remaining: json.capacity_remaining };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchReceivedMatchInvites(
  token: string | null | undefined,
): Promise<{ ok: true; invites: ReceivedMatchInvite[] } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para continuar' };
  try {
    const res = await fetch(`${API_URL}/matches/invites/received`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      invites?: ReceivedMatchInvite[];
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudieron cargar las invitaciones' };
    }
    return { ok: true, invites: json.invites ?? [] };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function sendMatchPlayerInvites(
  matchId: string,
  playerIds: string[],
  token: string | null | undefined,
): Promise<
  | {
      ok: true;
      created: number;
      reactivated?: number;
      skipped: Array<{ target: string; reason: string }>;
      invites?: MatchInviteRow[];
    }
  | { ok: false; error: string }
> {
  if (!token) return { ok: false, error: 'Inicia sesión para continuar' };
  const invites = [...new Set(playerIds.map((id) => id.trim()).filter(Boolean))].map((player_id) => ({
    player_id,
  }));
  if (!invites.length) return { ok: false, error: 'Añade al menos un jugador' };
  try {
    const res = await fetch(`${API_URL}/matches/${encodeURIComponent(matchId)}/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ invites }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      created?: number;
      reactivated?: number;
      skipped?: Array<{ target: string; reason: string }>;
      invites?: MatchInviteRow[];
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudieron enviar las invitaciones' };
    }
    return {
      ok: true,
      created: json.created ?? 0,
      reactivated: json.reactivated ?? 0,
      skipped: json.skipped ?? [],
      invites: json.invites ?? [],
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function acceptReceivedMatchInvite(
  inviteId: string,
  token: string | null | undefined,
): Promise<
  | { ok: true; match_id: string; slot_index?: number; already_accepted?: boolean }
  | { ok: false; error: string }
> {
  if (!token) return { ok: false, error: 'Inicia sesión para continuar' };
  try {
    const res = await fetch(`${API_URL}/matches/invites/inbox/${encodeURIComponent(inviteId)}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      match_id?: string;
      slot_index?: number;
      already_accepted?: boolean;
    };
    if (!res.ok || !json.ok || !json.match_id) {
      return { ok: false, error: json.error ?? 'No se pudo aceptar la invitación' };
    }
    return {
      ok: true,
      match_id: json.match_id,
      slot_index: json.slot_index,
      already_accepted: json.already_accepted,
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function rejectReceivedMatchInvite(
  inviteId: string,
  token: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para continuar' };
  try {
    const res = await fetch(`${API_URL}/matches/invites/inbox/${encodeURIComponent(inviteId)}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo rechazar la invitación' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function resendMatchInvite(
  matchId: string,
  inviteId: string,
  token: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para continuar' };
  try {
    const res = await fetch(
      `${API_URL}/matches/${encodeURIComponent(matchId)}/invites/${encodeURIComponent(inviteId)}/resend`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      },
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo reenviar la invitación' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function dismissMatchInvite(
  matchId: string,
  inviteId: string,
  token: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para continuar' };
  try {
    const res = await fetch(
      `${API_URL}/matches/${encodeURIComponent(matchId)}/invites/${encodeURIComponent(inviteId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo quitar la invitación' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export function playerInviteLabel(p: PlayerSearchHit): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  if (name && p.username) return `${name} (@${p.username})`;
  return name || (p.username ? `@${p.username}` : 'Jugador');
}

export function skipReasonLabel(reason: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    player_not_found: t('partidos.privateInviteErrNotRegistered'),
    invalid_target: t('partidos.privateInviteErrNotRegistered'),
    ya_invitado: t('partidos.privateInviteErrAlreadyInvited'),
    ya_en_partido: t('partidos.privateInviteErrAlreadyInMatch'),
    organizador: t('partidos.privateInviteErrOrganizer'),
    sin_plazas: t('partidos.privateInviteErrNoSlots'),
    duplicado_en_payload: t('partidos.privateInviteErrDuplicate'),
    horario_ocupado: t('partidos.privateInviteErrScheduleBusy'),
  };
  return map[reason] ?? reason;
}

import { API_URL } from '../config';

export type MatchmakingJoinPayload = {
  available_from: string;
  available_until: string;
  club_id?: string;
  max_distance_km?: number;
  search_lat?: number;
  search_lng?: number;
  preferred_side?: 'drive' | 'backhand' | 'any';
  gender?: 'male' | 'female' | 'mixed' | 'any';
  paired_with_id?: string;
};

type ApiError = {
  ok?: boolean;
  error?: string;
};

export type MatchmakingStatusResponse = {
  ok: boolean;
  status: 'not_in_pool' | 'searching' | 'matched' | 'blocked' | string;
  match_id: string | null;
  expansion_offer: {
    kind?: string;
    title?: string;
    message?: string;
    suggested_max_distance_km?: number;
  } | null;
  blocked_until?: string | null;
};

export type MatchmakingProposalResponse = {
  ok: boolean;
  has_proposal: boolean;
  status?: string;
  match_id?: string | null;
  confirm_deadline_at?: string | null;
  pre_match_win_prob?: number | null;
  booking_id?: string | null;
  your_participant_id?: string | null;
  your_share_cents?: number | null;
  your_payment_status?: string | null;
};

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as ApiError;
    return json.error ?? 'No se pudo completar la operación';
  } catch {
    return 'No se pudo completar la operación';
  }
}

export async function joinMatchmaking(
  body: MatchmakingJoinPayload,
  token: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };

  try {
    const res = await fetch(`${API_URL}/matchmaking/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { ok: false, error: await parseErrorMessage(res) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function leaveMatchmaking(
  token: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };

  try {
    const res = await fetch(`${API_URL}/matchmaking/leave`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { ok: false, error: await parseErrorMessage(res) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchMatchmakingStatus(
  token: string | null | undefined
): Promise<MatchmakingStatusResponse | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/matchmaking/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as MatchmakingStatusResponse;
    if (!json.ok) return null;
    return json;
  } catch {
    return null;
  }
}

export async function fetchMatchmakingProposal(
  token: string | null | undefined
): Promise<MatchmakingProposalResponse | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/matchmaking/proposal`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as MatchmakingProposalResponse;
    if (!json.ok) return null;
    return json;
  } catch {
    return null;
  }
}

export async function respondMatchmakingExpansion(
  accept: boolean,
  token: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/matchmaking/expansion-respond`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accept }),
    });
    if (!res.ok) {
      return { ok: false, error: await parseErrorMessage(res) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

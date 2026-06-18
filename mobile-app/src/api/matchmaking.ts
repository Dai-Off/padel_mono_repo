import { API_URL } from '../config';

export type MatchmakingLeagueConfigRow = {
  code: string;
  sort_order: number;
  label: string;
  elo_min: number;
  elo_max: number;
  lps_to_promote: number | null;
};

/** Público: etiquetas y umbrales LP por liga (doc. matchmaking leagues). */
export async function fetchMatchmakingLeagueConfig(): Promise<MatchmakingLeagueConfigRow[] | null> {
  try {
    const res = await fetch(`${API_URL}/matchmaking/league-config`, {
      cache: 'no-store' as RequestCache,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; leagues?: MatchmakingLeagueConfigRow[] };
    if (!json.ok || !Array.isArray(json.leagues)) return null;
    return json.leagues;
  } catch {
    return null;
  }
}

export type MatchmakingJoinPayload = {
  available_from: string;
  available_until: string;
  club_id?: string;
  preferred_club_ids?: string[];
  max_distance_km?: number;
  search_lat?: number;
  search_lng?: number;
  preferred_side?: 'drive' | 'backhand' | 'any';
  gender?: 'male' | 'female' | 'mixed' | 'any';
};

type ApiError = {
  ok?: boolean;
  error?: string;
};

/** Invitación de pareja accionable por el jugador (banner en Home). */
export type PairInvite = {
  id: string;
  /** 'invitee' = me invitaron (pendiente); 'inviter' = yo invité y aceptaron. */
  role: 'invitee' | 'inviter';
  status: string;
  other_player_id: string;
  other_player_name: string;
  other_player_avatar?: string | null;
  expires_at: string;
  /** Diferencia de nivel con el otro jugador; >1 implica buscar al nivel del superior. */
  level_gap?: number;
  /** Liga a la que se buscará el partido (la del jugador de mayor nivel). */
  target_liga?: string;
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
  /** En búsqueda (no expirada), conteo total */
  searching_count?: number;
  /** Si aplica club en la fila de cola, búsquedas en ese club */
  searching_in_club_count?: number | null;
  /** Invitaciones de pareja accionables (banners por polling). */
  pair_invites?: PairInvite[];
};

export type MatchmakingLeaderboardRow = {
  rank: number;
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  elo_rating: number | null;
  lps: number;
  mm_wins: number;
  mm_losses: number;
};

export type MatchmakingLeaderboardResponse = {
  ok: boolean;
  liga: string;
  total: number;
  offset?: number;
  limit?: number;
  has_more?: boolean;
  rows: MatchmakingLeaderboardRow[];
};

/** Ranking paginado de la división MM. */
export async function fetchMatchmakingLeaderboard(
  token: string | null | undefined,
  opts?: { liga?: string | null; limit?: number; offset?: number },
): Promise<MatchmakingLeaderboardResponse | null> {
  if (!token) return null;
  const params = new URLSearchParams();
  if (opts?.liga?.trim()) params.set('liga', opts.liga.trim());
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  try {
    const res = await fetch(`${API_URL}/matchmaking/leaderboard${qs ? `?${qs}` : ''}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as MatchmakingLeaderboardResponse;
    if (!json.ok || !Array.isArray(json.rows)) return null;
    return json;
  } catch {
    return null;
  }
}

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

/** Búsqueda activa o propuesta matchmaking sin pagar todavía. */
export function isMatchmakingFlowPending(
  status: MatchmakingStatusResponse | null | undefined,
  proposal?: MatchmakingProposalResponse | null,
): boolean {
  if (status?.status === 'searching') return true;
  if (status?.status === 'matched') {
    return proposal?.your_payment_status !== 'paid';
  }
  return false;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as ApiError;
    return json.error ?? 'No se pudo completar la operación';
  } catch {
    return 'No se pudo completar la operación';
  }
}

export type JoinMatchmakingResult =
  | { ok: true }
  | { ok: false; error: string; alreadyInQueue?: boolean };

export async function joinMatchmaking(
  body: MatchmakingJoinPayload,
  token: string | null | undefined
): Promise<JoinMatchmakingResult> {
  if (!token) return { ok: false, error: 'Token requerido' };

  try {
    const res = await fetch(`${API_URL}/matchmaking/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
      body: JSON.stringify(body),
    });

    let json: ApiError = {};
    try {
      json = (await res.json()) as ApiError;
    } catch {
      // body vacío / no JSON
    }

    if (res.ok) return { ok: true };
    if (res.status === 409) {
      return {
        ok: false,
        error: json.error ?? 'Ya estás en la cola de matchmaking',
        alreadyInQueue: true,
      };
    }
    return { ok: false, error: json.error ?? 'No se pudo completar la operación' };
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
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
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
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as MatchmakingStatusResponse;
    if (!json.ok) return null;
    return json;
  } catch {
    return null;
  }
}

export type SeasonTransition = {
  /** Temporada nueva (activa). Clave para recordar que ya se mostró. */
  season_id: string;
  previous_liga: string;
  previous_season_name: string;
  new_liga: string;
  new_season_name: string;
};

/** Última transición de temporada del jugador (para el modal de fin de temporada). null si no aplica. */
export async function fetchSeasonTransition(
  token: string | null | undefined,
): Promise<SeasonTransition | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/matchmaking/season-transition`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; transition?: SeasonTransition | null };
    if (!json.ok) return null;
    return json.transition ?? null;
  } catch {
    return null;
  }
}

/** Versión ligera: solo las invitaciones de pareja accionables (para el selector de compañero). */
export async function fetchPairInvites(token: string | null | undefined): Promise<PairInvite[]> {
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/matchmaking/pair-invites`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { ok: boolean; pair_invites?: PairInvite[] };
    if (!json.ok) return [];
    return json.pair_invites ?? [];
  } catch {
    return [];
  }
}

export async function fetchMatchmakingProposal(
  token: string | null | undefined
): Promise<MatchmakingProposalResponse | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/matchmaking/proposal`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as MatchmakingProposalResponse;
    if (!json.ok) return null;
    return json;
  } catch {
    return null;
  }
}

export async function rejectMatchmakingProposal(
  matchId: string,
  token: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/matchmaking/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
      body: JSON.stringify({ match_id: matchId }),
    });
    if (!res.ok) {
      return { ok: false, error: await parseErrorMessage(res) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

// ---- Invitaciones de pareja (premade duo) ----

/** Crear invitación: solo el jugador invitado. Las preferencias se fijan al buscar. */
export async function createPairInvite(
  inviteeId: string,
  token: string | null | undefined
): Promise<{ ok: true; invite_id: string } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/matchmaking/pair-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
      body: JSON.stringify({ invitee_player_id: inviteeId }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; invite_id?: string };
    if (res.ok && json.invite_id) return { ok: true, invite_id: json.invite_id };
    return { ok: false, error: json.error ?? 'No se pudo enviar la invitación' };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

async function postPairInvite(
  inviteId: string,
  action: 'accept' | 'accept-and-search' | 'start-search' | 'reject' | 'cancel',
  token: string | null | undefined,
  body?: MatchmakingJoinPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/matchmaking/pair-invite/${inviteId}/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return { ok: false, error: await parseErrorMessage(res) };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export const acceptPairInvite = (id: string, token: string | null | undefined) =>
  postPairInvite(id, 'accept', token);
export const rejectPairInvite = (id: string, token: string | null | undefined) =>
  postPairInvite(id, 'reject', token);
export const cancelPairInvite = (id: string, token: string | null | undefined) =>
  postPairInvite(id, 'cancel', token);
/** Buscar con una pareja ya aceptada, con las prefs actuales (cualquiera de los dos). */
export const startSearchPairInvite = (
  id: string,
  prefs: MatchmakingJoinPayload,
  token: string | null | undefined
) => postPairInvite(id, 'start-search', token, prefs);
/** Aceptar y buscar a la vez (invitado), con las prefs actuales. */
export const acceptAndSearchPairInvite = (
  id: string,
  prefs: MatchmakingJoinPayload,
  token: string | null | undefined
) => postPairInvite(id, 'accept-and-search', token, prefs);

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
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store' as RequestCache,
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

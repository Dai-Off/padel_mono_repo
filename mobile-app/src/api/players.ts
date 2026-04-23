import { API_URL } from '../config';

type PlayersResponse = {
  ok?: boolean;
  players?: { id: string }[];
  error?: string;
};

type MeResponse = {
  ok?: boolean;
  player?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    elo_rating?: number | null;
    status?: string | null;
    liga?: string | null;
    lps?: number | null;
    mm_peak_liga?: string | null;
    matches_played_matchmaking?: number | null;
    fiabilidad?: number | null;
    mm_wins?: number | null;
    mm_losses?: number | null;
    mm_draws?: number | null;
    /** Presente solo si el backend lo incluye en `/players/me`. */
    onboarding_completed?: boolean | null;
  };
  error?: string;
};

export type MyPlayerProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  eloRating: number | null;
  status: string | null;
  /** Código de liga MM global: bronce | plata | oro | elite */
  liga: string | null;
  lps: number | null;
  mmPeakLiga: string | null;
  matchesPlayedMatchmaking: number | null;
  fiabilidad: number | null;
  mmWins: number;
  mmLosses: number;
  mmDraws: number;
  /**
   * Onboarding de nivelación; si el backend no envía el campo, se asume completado
   * para no bloquear la app.
   */
  onboardingCompleted: boolean;
};

/** Obtiene el jugador actual según la sesión (Bearer token). */
export async function fetchMyPlayerId(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as MeResponse;
    if (res.ok && json.ok && json.player) return json.player.id;
    return null;
  } catch {
    return null;
  }
}

/** Obtiene el perfil completo del jugador actual según la sesión (Bearer token). */
export async function fetchMyPlayerProfile(
  token: string | null | undefined
): Promise<MyPlayerProfile | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as MeResponse;
    if (!res.ok || !json.ok || !json.player) return null;
    const rawElo = json.player.elo_rating as number | string | null | undefined;
    const eloNum =
      rawElo == null || rawElo === ''
        ? null
        : typeof rawElo === 'number'
          ? rawElo
          : Number(String(rawElo).trim());
    const rawLps = json.player.lps as number | string | null | undefined;
    const lpsNum =
      rawLps == null || rawLps === ''
        ? null
        : typeof rawLps === 'number'
          ? rawLps
          : Number(String(rawLps).trim());
    const rawMpm = json.player.matches_played_matchmaking as number | string | null | undefined;
    const mpmNum =
      rawMpm == null || rawMpm === ''
        ? null
        : typeof rawMpm === 'number'
          ? rawMpm
          : Number(String(rawMpm).trim());
    const rawFiab = json.player.fiabilidad as number | string | null | undefined;
    const fiabNum =
      rawFiab == null || rawFiab === ''
        ? null
        : typeof rawFiab === 'number'
          ? rawFiab
          : Number(String(rawFiab).trim());
    const parseInt0 = (v: unknown): number => {
      if (v == null || v === '') return 0;
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      return n != null && !Number.isNaN(n) ? Math.max(0, Math.round(n)) : 0;
    };
    return {
      id: json.player.id,
      firstName: json.player.first_name ?? null,
      lastName: json.player.last_name ?? null,
      email: json.player.email ?? null,
      phone: json.player.phone ?? null,
      eloRating: eloNum != null && !Number.isNaN(eloNum) ? eloNum : null,
      status: json.player.status ?? null,
      liga: json.player.liga != null && String(json.player.liga).trim() !== '' ? String(json.player.liga) : null,
      lps: lpsNum != null && !Number.isNaN(lpsNum) ? Math.max(0, Math.round(lpsNum)) : null,
      mmPeakLiga:
        json.player.mm_peak_liga != null && String(json.player.mm_peak_liga).trim() !== ''
          ? String(json.player.mm_peak_liga)
          : null,
      matchesPlayedMatchmaking: mpmNum != null && !Number.isNaN(mpmNum) ? Math.max(0, Math.round(mpmNum)) : null,
      fiabilidad: fiabNum != null && !Number.isNaN(fiabNum) ? Math.max(0, Math.min(100, Math.round(fiabNum))) : null,
      mmWins: parseInt0(json.player.mm_wins),
      mmLosses: parseInt0(json.player.mm_losses),
      mmDraws: parseInt0(json.player.mm_draws),
      onboardingCompleted: json.player.onboarding_completed !== false,
    };
  } catch {
    return null;
  }
}

/** Obtiene el id del primer jugador disponible (para desarrollo/pruebas cuando no hay auth). */
export type PlayerSearchHit = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
};

/** Lista jugadores; con `q` filtra por nombre o teléfono (misma API que el panel). */
export async function searchPlayers(
  q: string,
  token: string | null | undefined
): Promise<{ ok: true; players: PlayerSearchHit[] } | { ok: false; error: string }> {
  try {
    const url = new URL(`${API_URL}/players`);
    const trimmed = q.trim();
    if (trimmed.length > 0) url.searchParams.set('q', trimmed);
    const res = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const json = (await res.json()) as { ok?: boolean; players?: PlayerSearchHit[]; error?: string };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'Búsqueda no disponible' };
    return { ok: true, players: json.players ?? [] };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchFirstPlayerId(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/players`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const json = (await res.json()) as PlayersResponse;
    const players = json.players;
    if (Array.isArray(players) && players.length > 0) {
      return players[0].id;
    }
    return null;
  } catch {
    return null;
  }
}

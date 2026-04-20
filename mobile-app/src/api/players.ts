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
    const rawLps = json.player.lps;
    const lpsNum =
      rawLps == null || rawLps === ''
        ? null
        : typeof rawLps === 'number'
          ? rawLps
          : Number(String(rawLps).trim());
    const rawMpm = json.player.matches_played_matchmaking;
    const mpmNum =
      rawMpm == null || rawMpm === ''
        ? null
        : typeof rawMpm === 'number'
          ? rawMpm
          : Number(String(rawMpm).trim());
    const rawFiab = json.player.fiabilidad;
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
    };
  } catch {
    return null;
  }
}

/** Obtiene el id del primer jugador disponible (para desarrollo/pruebas cuando no hay auth). */
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

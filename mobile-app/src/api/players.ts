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
};

/** Obtiene el jugador actual según la sesión (Bearer token). */
export async function fetchMyPlayerId(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as MeResponse;
    if (json.ok && json.player) return json.player.id;
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
    if (!json.ok || !json.player) return null;
    return {
      id: json.player.id,
      firstName: json.player.first_name ?? null,
      lastName: json.player.last_name ?? null,
      email: json.player.email ?? null,
      phone: json.player.phone ?? null,
      eloRating: json.player.elo_rating ?? null,
      status: json.player.status ?? null,
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

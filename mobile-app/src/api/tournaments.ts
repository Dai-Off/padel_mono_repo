import { API_URL } from '../config';

export type TournamentPrize = { label: string; amount_cents: number };

export type ClubPublicEmbed = {
  id?: string;
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  lat?: number | null;
  lng?: number | null;
  logo_url?: string | null;
};

export type ClubBrief = ClubPublicEmbed | ClubPublicEmbed[] | null;

export type PublicTournamentRow = {
  id: string;
  club_id: string;
  created_at?: string;
  updated_at?: string;
  start_at: string;
  end_at: string;
  duration_min: number;
  /** Precio de inscripción por jugador/equipo según `registration_mode`, en céntimos (p. ej. 2500 = 25,00 €). */
  price_cents: number;
  prize_total_cents?: number | null;
  /** JSONB en backend; array de premios por puesto. */
  prizes?: TournamentPrize[] | unknown;
  currency: string;
  visibility?: string;
  gender?: 'male' | 'female' | 'mixed' | string | null;
  max_players: number;
  status: string;
  description: string | null;
  normas?: string | null;
  elo_min: number | null;
  elo_max: number | null;
  registration_mode: 'individual' | 'pair';
  registration_closed_at?: string | null;
  cancellation_cutoff_at?: string | null;
  invite_ttl_minutes?: number;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
  closed_at?: string | null;
  created_by_player_id?: string | null;
  tournament_courts?: { court_id: string }[] | null;
  clubs?: ClubBrief;
  confirmed_count?: number;
  pending_count?: number;
};

type ListResponse = { ok?: boolean; tournaments?: PublicTournamentRow[]; error?: string };

function headers(token: string | null | undefined): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function fetchPublicTournaments(
  token: string | null | undefined,
): Promise<{ ok: true; tournaments: PublicTournamentRow[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/tournaments/public/list`, { headers: headers(token) });
    const json = (await res.json()) as ListResponse;
    if (!res.ok) return { ok: false, error: json.error ?? 'No se pudieron cargar los torneos' };
    return { ok: true, tournaments: json.tournaments ?? [] };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchMyTournaments(
  token: string | null | undefined,
): Promise<{ ok: true; tournaments: PublicTournamentRow[] } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para ver tus inscripciones' };
  try {
    const res = await fetch(`${API_URL}/tournaments/player/me-list`, { headers: headers(token) });
    const json = (await res.json()) as ListResponse;
    if (!res.ok) return { ok: false, error: json.error ?? 'No se pudieron cargar tus torneos' };
    return { ok: true, tournaments: json.tournaments ?? [] };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

type DetailResponse = {
  ok?: boolean;
  tournament?: PublicTournamentRow;
  counts?: { confirmed: number; pending: number };
  error?: string;
};

export async function fetchTournamentPublicDetail(
  tournamentId: string,
): Promise<
  | { ok: true; tournament: PublicTournamentRow; counts: { confirmed: number; pending: number } }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${API_URL}/tournaments/public/${encodeURIComponent(tournamentId)}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const json = (await res.json()) as DetailResponse;
    if (!res.ok || !json.ok || !json.tournament) {
      return { ok: false, error: json.error ?? 'No se pudo cargar el torneo' };
    }
    return {
      ok: true,
      tournament: json.tournament,
      counts: json.counts ?? { confirmed: 0, pending: 0 },
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function joinPublicTournament(
  tournamentId: string,
  token: string,
): Promise<{ ok: true; already_joined?: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/join`, {
      method: 'POST',
      headers: headers(token),
    });
    const json = (await res.json()) as { ok?: boolean; already_joined?: boolean; error?: string };
    if (res.ok && json.ok) return { ok: true, already_joined: json.already_joined };
    return { ok: false, error: json.error ?? 'No se pudo completar la inscripción' };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

/** Baja del torneo (inscripción pending o confirmed). */
export async function leaveTournament(
  tournamentId: string,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/leave`, {
      method: 'POST',
      headers: headers(token),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok && json.ok) return { ok: true };
    return { ok: false, error: json.error ?? 'No se pudo cancelar la inscripción' };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

type PlayerDetailJson = {
  ok?: boolean;
  tournament?: PublicTournamentRow;
  counts?: { confirmed: number; pending: number };
  my_inscription?: { status?: string } | null;
  error?: string;
};

/** Detalle con inscripción del jugador (requiere sesión). */
export async function fetchTournamentPlayerDetail(
  tournamentId: string,
  token: string | null | undefined,
): Promise<{
  tournament: PublicTournamentRow;
  counts: { confirmed: number; pending: number };
  my_inscription: { status?: string } | null;
} | null> {
  if (!token) return null;
  try {
    const res = await fetch(
      `${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/player-detail`,
      { headers: headers(token) },
    );
    const json = (await res.json()) as PlayerDetailJson;
    if (!res.ok || !json.ok || !json.tournament) return null;
    return {
      tournament: json.tournament,
      counts: json.counts ?? { confirmed: 0, pending: 0 },
      my_inscription: json.my_inscription ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Detalle para la pantalla del torneo: **una sola petición** si hay sesión (`player-detail`
 * ya incluye torneo + cupos + inscripción), evitando duplicar trabajo en servidor con
 * `public/:id` + `player-detail` en paralelo.
 */
export async function fetchTournamentDetailForScreen(
  tournamentId: string,
  token: string | null | undefined,
): Promise<
  | {
      ok: true;
      tournament: PublicTournamentRow;
      counts: { confirmed: number; pending: number };
      my_inscription: { status?: string } | null;
    }
  | { ok: false; error: string }
> {
  const t = token?.trim();
  if (t) {
    try {
      const res = await fetch(
        `${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/player-detail`,
        { headers: headers(t) },
      );
      const json = (await res.json()) as PlayerDetailJson;
      if (res.ok && json.ok && json.tournament) {
        return {
          ok: true,
          tournament: json.tournament,
          counts: json.counts ?? { confirmed: 0, pending: 0 },
          my_inscription: json.my_inscription ?? null,
        };
      }
      /** Nunca sustituir por detalle público con `my_inscription: null`: el usuario vería «Inscribirme» aunque esté inscrito. */
      return {
        ok: false,
        error: json.error ?? `No se pudo cargar el torneo (${res.status})`,
      };
    } catch {
      return { ok: false, error: 'Error de conexión' };
    }
  }
  return fetchTournamentPublicDetail(tournamentId).then((p) =>
    p.ok
      ? {
          ok: true,
          tournament: p.tournament,
          counts: p.counts,
          my_inscription: null,
        }
      : { ok: false, error: p.error },
  );
}

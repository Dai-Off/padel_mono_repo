import { API_URL } from '../config';

export type Match = {
  id: string;
  created_at: string;
  booking_id: string | null;
  visibility: 'public' | 'private' | string;
  elo_min: number | null;
  elo_max: number | null;
  gender: string | null;
  competitive: boolean;
  status: string;
};

type PlayerRef = {
  id: string;
  first_name: string;
  last_name: string;
  elo_rating: number;
};

type MatchPlayerRef = {
  id: string;
  team: 'A' | 'B';
  created_at: string;
  slot_index?: number | null;
  players: PlayerRef | null;
};

export type MatchEnriched = Match & {
  bookings?: {
    id: string;
    organizer_player_id?: string | null;
    start_at: string;
    end_at: string;
    total_price_cents: number;
    currency: string;
    court_id: string;
    courts?: {
      id: string;
      club_id: string;
      name?: string;
      indoor?: boolean;
      glass_type?: string;
      clubs?: { id: string; name: string; address: string; city: string } | null;
    } | null;
  } | null;
  match_players?: MatchPlayerRef[] | null;
};

type MatchesResponse = {
  ok?: boolean;
  matches?: Match[] | MatchEnriched[];
  error?: string;
};

type FetchMatchesOptions = {
  bookingId?: string;
  expand?: boolean;
  token?: string | null;
  /**
   * Solo partidos pendientes o en curso (excluye ya jugados por horario y estado).
   * Por defecto true para listados en la app.
   */
  activeOnly?: boolean;
};

export async function fetchMatches(options: FetchMatchesOptions = {}): Promise<MatchEnriched[]> {
  const { bookingId, expand = true, token, activeOnly = true } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = new URL(`${API_URL}/matches`);
  if (bookingId) url.searchParams.set('booking_id', bookingId);
  if (expand) url.searchParams.set('expand', '1');
  if (activeOnly) url.searchParams.set('active_only', '1');

  try {
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) return [];
    const json = (await res.json()) as MatchesResponse;
    if (Array.isArray(json.matches)) return json.matches as MatchEnriched[];
    return [];
  } catch {
    return [];
  }
}

export type CreateMatchWithBookingParams = {
  court_id: string;
  organizer_player_id: string;
  start_at: string;
  end_at: string;
  total_price_cents: number;
  timezone?: string;
  visibility?: 'public' | 'private';
  elo_min?: number | null;
  elo_max?: number | null;
  gender?: string | null;
  competitive?: boolean;
  token?: string | null;
};

type CreateMatchResponse = {
  ok?: boolean;
  match?: Match;
  booking?: { id: string; organizer_participant_id?: string };
  error?: string;
};

type JoinMatchResponse = {
  ok?: boolean;
  error?: string;
};

type PrepareJoinResponse = {
  ok?: boolean;
  participant_id?: string;
  booking_id?: string;
  share_amount_cents?: number;
  error?: string;
};

type MatchResponse = {
  ok?: boolean;
  match?: MatchEnriched;
  error?: string;
};

export async function prepareJoin(
  matchId: string,
  slotIndex: number,
  token: string | null | undefined
): Promise<{ participantId: string; bookingId: string } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/matches/${matchId}/prepare-join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slot_index: slotIndex }),
    });
    const json = (await res.json()) as PrepareJoinResponse;
    if (json.ok && json.participant_id && json.booking_id) {
      return { participantId: json.participant_id, bookingId: json.booking_id };
    }
    return { ok: false, error: json.error ?? 'No se pudo preparar' };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function joinMatch(
  matchId: string,
  token: string | null | undefined,
  slotIndex?: number
): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/matches/${matchId}/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: slotIndex != null ? JSON.stringify({ slot_index: slotIndex }) : undefined,
    });
    const json = (await res.json()) as JoinMatchResponse;
    if (json.ok) return { ok: true };
    return { ok: false, error: json.error ?? 'No se pudo unir' };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

type CancelMatchResponse = {
  ok?: boolean;
  error?: string;
  refund_errors?: string[];
  cancelled_entire_match?: boolean;
  match?: { id: string; status?: string };
};

/**
 * Partido público: cualquier jugador. Si quedas solo, se cancela todo; si hay más, solo sales tú.
 * Partido privado: solo organizador; cancelación total.
 */
export async function cancelMatchAsOrganizer(
  matchId: string,
  token: string | null | undefined
): Promise<
  | { ok: true; cancelledEntireMatch: boolean }
  | { ok: false; error: string; refund_errors?: string[] }
> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/matches/${matchId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const json = (await res.json()) as CancelMatchResponse;
    if (json.ok) {
      return {
        ok: true,
        cancelledEntireMatch: json.cancelled_entire_match !== false,
      };
    }
    return {
      ok: false,
      error: json.error ?? 'No se pudo cancelar el partido',
      refund_errors: json.refund_errors,
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchMatchById(
  matchId: string,
  token?: string | null
): Promise<MatchEnriched | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_URL}/matches/${matchId}?expand=1`, { headers });
    if (!res.ok) return null;
    const json = (await res.json()) as MatchResponse;
    if (json.ok && json.match) return json.match;
    return null;
  } catch {
    return null;
  }
}

export async function createMatchWithBooking(
  params: CreateMatchWithBookingParams
): Promise<{ match: Match; bookingId: string; organizerParticipantId?: string } | null> {
  const { token, ...body } = params;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_URL}/matches/create-with-booking`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as CreateMatchResponse;
    if (json.ok && json.match && json.booking) {
      return {
        match: json.match,
        bookingId: json.booking.id,
        organizerParticipantId: json.booking.organizer_participant_id,
      };
    }
    return null;
  } catch {
    return null;
  }
}


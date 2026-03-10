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
  players: PlayerRef | null;
};

export type MatchEnriched = Match & {
  bookings?: {
    id: string;
    start_at: string;
    end_at: string;
    total_price_cents: number;
    currency: string;
    court_id: string;
    courts?: {
      id: string;
      club_id: string;
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
};

export async function fetchMatches(options: FetchMatchesOptions = {}): Promise<MatchEnriched[]> {
  const { bookingId, expand = true, token } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = new URL(`${API_URL}/matches`);
  if (bookingId) url.searchParams.set('booking_id', bookingId);
  if (expand) url.searchParams.set('expand', '1');

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
  booking?: { id: string };
  error?: string;
};

type JoinMatchResponse = {
  ok?: boolean;
  error?: string;
};

type MatchResponse = {
  ok?: boolean;
  match?: MatchEnriched;
  error?: string;
};

export async function joinMatch(
  matchId: string,
  token: string | null | undefined
): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/matches/${matchId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as JoinMatchResponse;
    if (json.ok) return { ok: true };
    return { ok: false, error: json.error ?? 'No se pudo unir' };
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
): Promise<{ match: Match; bookingId: string } | null> {
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
      return { match: json.match, bookingId: json.booking.id };
    }
    return null;
  } catch {
    return null;
  }
}


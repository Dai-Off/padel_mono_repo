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

type MatchesResponse = {
  ok?: boolean;
  matches?: Match[];
  error?: string;
};

type FetchMatchesOptions = {
  bookingId?: string;
  token?: string | null;
  sport?: string;
  dateFrom?: string;
  timeFrom?: string;
  timeTo?: string;
  sortBy?: string;
  maxDistanceKm?: number;
  duration?: number;
  cerramiento?: string | null;
  paredes?: string | null;
};

export async function fetchMatches(options: FetchMatchesOptions = {}): Promise<Match[]> {
  const {
    bookingId,
    token,
    sport,
    dateFrom,
    timeFrom,
    timeTo,
    sortBy,
    maxDistanceKm,
    duration,
    cerramiento,
    paredes,
  } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = new URL(`${API_URL}/matches`);
  if (bookingId) url.searchParams.set('booking_id', bookingId);
  if (sport) url.searchParams.set('sport', sport);
  if (dateFrom) url.searchParams.set('date_from', dateFrom);
  if (timeFrom) url.searchParams.set('time_from', timeFrom);
  if (timeTo) url.searchParams.set('time_to', timeTo);
  if (sortBy) url.searchParams.set('sort_by', sortBy);
  if (maxDistanceKm != null) url.searchParams.set('max_distance_km', String(maxDistanceKm));
  if (duration != null) url.searchParams.set('duration', String(duration));
  if (cerramiento) url.searchParams.set('cerramiento', cerramiento);
  if (paredes) url.searchParams.set('paredes', paredes);

  try {
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      return [];
    }
    const json = (await res.json()) as MatchesResponse;
    if (Array.isArray(json.matches)) {
      return json.matches;
    }
    return [];
  } catch {
    return [];
  }
}


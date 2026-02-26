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
};

export async function fetchMatches(options: FetchMatchesOptions = {}): Promise<Match[]> {
  const { bookingId, token } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = new URL(`${API_URL}/matches`);
  if (bookingId) url.searchParams.set('booking_id', bookingId);

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


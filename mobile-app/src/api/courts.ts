import { API_URL } from '../config';

export type Court = {
  id: string;
  club_id: string;
  name: string;
  indoor: boolean;
  glass_type: string;
  status?: string;
};

export async function fetchCourtsByClubId(clubId: string): Promise<Court[]> {
  try {
    const url = new URL(`${API_URL}/courts`);
    url.searchParams.set('club_id', clubId);
    const res = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
    });
    const json = (await res.json()) as { ok?: boolean; courts?: Court[]; error?: string };
    if (!res.ok) {
      __DEV__ && console.warn('[courts] API error:', res.status, json.error);
      return [];
    }
    return Array.isArray(json.courts) ? json.courts : [];
  } catch (err) {
    __DEV__ && console.warn('[courts] Fetch failed:', err);
    return [];
  }
}

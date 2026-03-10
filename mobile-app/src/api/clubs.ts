import { API_URL } from '../config';

export type ClubDetail = {
  id: string;
  name: string;
  address: string;
  city: string;
  postal_code?: string;
  lat?: number | null;
  lng?: number | null;
  weekly_schedule?: Record<string, unknown>;
  schedule_exceptions?: unknown[];
};

export async function fetchClubById(id: string): Promise<ClubDetail | null> {
  try {
    const res = await fetch(`${API_URL}/clubs/${id}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const json = (await res.json()) as { ok?: boolean; club?: ClubDetail; error?: string };
    if (!res.ok) {
      __DEV__ && console.warn('[clubs] API error:', res.status, json.error);
      return null;
    }
    return json.club ?? null;
  } catch (err) {
    __DEV__ && console.warn('[clubs] Fetch failed:', err);
    return null;
  }
}

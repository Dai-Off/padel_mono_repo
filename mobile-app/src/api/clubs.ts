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
  timezone?: string | null;
  slot_duration_min?: number | null;
};

export async function fetchClubById(
  id: string,
  accessToken?: string | null,
): Promise<ClubDetail | null> {
  try {
    if (!accessToken) return null;
    const res = await fetch(`${API_URL}/clubs/${id}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
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

/** Info pública del club (sin auth): incluye `timezone` para reservas. */
export async function fetchClubPublicInfo(
  id: string,
): Promise<Pick<ClubDetail, 'id' | 'timezone' | 'slot_duration_min'> | null> {
  try {
    const res = await fetch(`${API_URL}/clubs/miniapp/${id}/public`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const json = (await res.json()) as {
      ok?: boolean;
      club?: Pick<ClubDetail, 'id' | 'timezone' | 'slot_duration_min'>;
    };
    if (!res.ok || !json.club) return null;
    return json.club;
  } catch {
    return null;
  }
}

/** Mapa clubId → zona IANA (paralelo, tolera fallos individuales). */
export async function fetchClubTimezones(
  clubIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(clubIds.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (id) => {
      const info = await fetchClubPublicInfo(id);
      const tz = info?.timezone?.trim();
      return tz ? ([id, tz] as const) : null;
    }),
  );
  return new Map(entries.filter((e): e is readonly [string, string] => e != null));
}

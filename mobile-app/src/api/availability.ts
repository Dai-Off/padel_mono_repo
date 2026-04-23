import { API_URL } from '../config';

export type AvailabilitySlot = {
  start: string;
  end: string;
};

export type CourtAvailability = {
  court_id: string;
  court_name: string;
  free_slots: AvailabilitySlot[];
};

export type FetchAvailableSlotsResponse = {
  ok: boolean;
  date: string;
  club_id?: string;
  duration_minutes?: number;
  results: CourtAvailability[];
  error?: string;
};

export type FetchAvailableSlotsParams = {
  clubId?: string;
  clubIds?: string[];
  date: string;
  courtId?: string;
  durationMinutes?: number;
  token: string | null | undefined;
};

export async function fetchAvailableSlots(
  params: FetchAvailableSlotsParams
): Promise<FetchAvailableSlotsResponse> {
  const { clubId, clubIds, date, courtId, durationMinutes, token } = params;
  if (!token) {
    return { ok: false, error: 'Token requerido', date, club_id: clubId ?? '', duration_minutes: 0, results: [] };
  }

  const url = new URL(`${API_URL}/availability/slots`);
  if (clubIds && clubIds.length > 0) {
    url.searchParams.set('club_ids', clubIds.join(','));
  } else if (clubId) {
    url.searchParams.set('club_id', clubId);
  }
  url.searchParams.set('date', date);
  if (courtId) url.searchParams.set('court_id', courtId);
  if (durationMinutes) url.searchParams.set('duration_minutes', String(durationMinutes));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    const json = (await res.json()) as FetchAvailableSlotsResponse;
    if (!res.ok) {
      return {
        ok: false,
        error: json.error ?? 'Error al cargar disponibilidad',
        date,
        club_id: clubId ?? '',
        duration_minutes: 0,
        results: [],
      };
    }
    return json;
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      date,
      club_id: clubId ?? '',
      duration_minutes: 0,
      results: [],
    };
  }
}

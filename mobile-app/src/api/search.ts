import { API_URL } from '../config';

export type SearchCourtResult = {
  id: string;
  clubId: string;
  clubName: string;
  courtName: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  indoor: boolean;
  glassType: string;
  imageUrl: string | null;
  distanceKm: number | null;
  minPriceCents: number;
  minPriceFormatted: string;
  timeSlots: string[];
};

type FetchSearchCourtsOptions = {
  dateFrom?: string;
  dateTo?: string;
  indoor?: boolean;
  glassType?: string;
};

export async function fetchSearchCourts(
  options: FetchSearchCourtsOptions = {}
): Promise<SearchCourtResult[]> {
  const { dateFrom, dateTo, indoor, glassType } = options;
  const url = new URL(`${API_URL}/search/courts`);
  if (dateFrom) url.searchParams.set('date_from', dateFrom);
  if (dateTo) url.searchParams.set('date_to', dateTo);
  if (indoor !== undefined) url.searchParams.set('indoor', String(indoor));
  if (glassType) url.searchParams.set('glass_type', glassType);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const json = (await res.json()) as { ok?: boolean; results?: SearchCourtResult[]; error?: string };
    if (!res.ok) {
      __DEV__ && console.warn('[search] API error:', res.status, json.error);
      return [];
    }
    if (!Array.isArray(json.results)) {
      __DEV__ && console.warn('[search] Invalid response:', json);
      return [];
    }
    return json.results;
  } catch (err) {
    __DEV__ && console.warn('[search] Fetch failed:', err);
    return [];
  }
}

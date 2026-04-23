import { API_URL } from '../config';

export interface SlotPriceBreakdownItem {
  slot: string;               // "HH:MM"
  minutes: number;
  price_per_hour_cents: number;
  contribution_cents: number;
  source: 'calendar' | 'reservation_type' | 'flat_rate' | 'none';
}

export interface SlotPriceResult {
  ok: boolean;
  club_id: string;
  court_id: string;
  date: string;
  slot: string;
  duration_minutes: number;
  total_price_cents: number;
  source: 'calendar' | 'reservation_type' | 'flat_rate' | 'mixed' | 'none';
  breakdown: SlotPriceBreakdownItem[];
  error?: string;
}

export async function getSlotPrice(params: {
  club_id: string;
  court_id: string;
  date: string;         // "YYYY-MM-DD"
  slot: string;         // "HH:MM"
  duration_minutes: number;
  reservation_type?: string;
}): Promise<SlotPriceResult> {
  try {
    const url = new URL(`${API_URL}/tariffs/slot-price`);
    url.searchParams.set('club_id', params.club_id);
    url.searchParams.set('court_id', params.court_id);
    url.searchParams.set('date', params.date);
    url.searchParams.set('slot', params.slot);
    url.searchParams.set('duration_minutes', params.duration_minutes.toString());
    if (params.reservation_type) {
      url.searchParams.set('reservation_type', params.reservation_type);
    }

    console.log('[getSlotPrice] Requesting:', url.toString());
    const res = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
    });
    const json = (await res.json()) as SlotPriceResult;
    console.log('[getSlotPrice] Response:', json);
    
    if (!res.ok) {
      throw new Error(json.error || 'Error al obtener el precio del slot');
    }
    
    return json;
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Error desconocido al obtener el precio del slot');
  }
}

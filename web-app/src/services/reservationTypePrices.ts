import { ApiServiceWithAuth } from './api';

export const RESERVATION_TYPES = [
  'standard',
  'open_match',
  'pozo',
  'fixed_recurring',
  'school_group',
  'school_individual',
  'flat_rate',
  'tournament',
  'blocked',
] as const;

export type ReservationType = (typeof RESERVATION_TYPES)[number];

export type PricesByType = Record<
  string,
  { price_per_hour_cents: number; currency: string }
>;

class ReservationTypePricesService extends ApiServiceWithAuth {
  async get(clubId: string): Promise<PricesByType> {
    const res = await super.get<{ ok: boolean; prices: PricesByType }>(
      `/reservation-type-prices?club_id=${encodeURIComponent(clubId)}`
    );
    if (!res.ok) throw new Error('Error fetching prices');
    return res.prices ?? {};
  }

  async update(clubId: string, prices: Record<string, number>): Promise<PricesByType> {
    const res = await this.put<{ ok: boolean; prices: PricesByType }>(
      '/reservation-type-prices',
      { club_id: clubId, prices }
    );
    if (!res.ok) throw new Error('Error updating prices');
    return res.prices ?? {};
  }
}

export const reservationTypePricesService = new ReservationTypePricesService();

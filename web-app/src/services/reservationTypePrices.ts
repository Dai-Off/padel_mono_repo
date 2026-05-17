import { ApiServiceWithAuth } from './api';

export interface ReservationTypeConfig {
  reservation_type: string;
  price_per_hour_cents: number;
  currency: string;
  color: string | null;
  allow_online: boolean;
  display_name: string;
  is_system: boolean;
  sort_order: number;
}

export type PricesByType = Record<string, ReservationTypeConfig>;

class ReservationTypePricesService extends ApiServiceWithAuth {
  async getByClub(clubId: string): Promise<PricesByType> {
    const res = await super.get<{ ok: boolean; prices: PricesByType }>(
      `/reservation-type-prices?club_id=${encodeURIComponent(clubId)}`
    );
    if (!res.ok) throw new Error('Error fetching prices');
    return res.prices ?? {};
  }

  async update(
    clubId: string,
    prices: Record<string, number>,
    colors?: Record<string, string>,
    allowOnline?: Record<string, boolean>
  ): Promise<PricesByType> {
    const res = await this.put<{ ok: boolean; prices: PricesByType }>(
      '/reservation-type-prices',
      { club_id: clubId, prices, colors, allow_online: allowOnline }
    );
    if (!res.ok) throw new Error('Error updating prices');
    return res.prices ?? {};
  }

  async createCustomType(
    clubId: string,
    data: { display_name: string; color?: string; price_per_hour_cents?: number }
  ): Promise<PricesByType> {
    const res = await this.post<{ ok: boolean; prices: PricesByType }>(
      '/reservation-type-prices/custom',
      { club_id: clubId, ...data }
    );
    if (!res.ok) throw new Error('Error creating custom reservation type');
    return res.prices ?? {};
  }

  async deleteCustomType(clubId: string, type: string): Promise<PricesByType> {
    const res = await this.deleteRequest<{ ok: boolean; prices: PricesByType }>(
      `/reservation-type-prices/custom/${encodeURIComponent(type)}?club_id=${encodeURIComponent(clubId)}`
    );
    if (!res.ok) throw new Error('Error deleting custom reservation type');
    return res.prices ?? {};
  }
}

export const reservationTypePricesService = new ReservationTypePricesService();


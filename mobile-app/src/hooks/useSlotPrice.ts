import { useState, useEffect } from 'react';
import { getSlotPrice, type SlotPriceResult } from '../api/tariffs';

export function useSlotPrice(params: {
  clubId?: string;
  courtId?: string;
  date?: string;
  slot?: string;
  durationMinutes?: number;
  reservationType?: string;
}) {
  const [priceData, setPriceData] = useState<SlotPriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.clubId && params.courtId && params.date && params.slot && params.durationMinutes) {
      const fetchPrice = async () => {
        setLoading(true);
        setError(null);
        console.log('[useSlotPrice] Fetching price for:', params);
        try {
          const result = await getSlotPrice({
            club_id: params.clubId!,
            court_id: params.courtId!,
            date: params.date!,
            slot: params.slot!,
            duration_minutes: params.durationMinutes!,
            reservation_type: params.reservationType,
          });
          console.log('[useSlotPrice] Success:', result);
          setPriceData(result);
        } catch (err) {
          console.error('[useSlotPrice] Error:', err);
          setError(err instanceof Error ? err.message : 'Error desconocido');
        } finally {
          setLoading(false);
        }
      };
      fetchPrice();
    }
  }, [params.clubId, params.courtId, params.date, params.slot, params.durationMinutes, params.reservationType]);

  return { priceData, loading, error };
}

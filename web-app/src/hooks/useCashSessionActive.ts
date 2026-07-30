import { useCallback, useEffect, useState } from 'react';
import { paymentsService } from '../services/payments';
import { localDateYmd } from '../lib/localDate';

type CashSessionState = {
  loading: boolean;
  active: boolean;
  refresh: () => Promise<void>;
};

/**
 * Indica si hay una sesión de caja abierta (apertura posterior al último cierre del día).
 */
export function useCashSessionActive(clubId: string | null | undefined): CashSessionState {
  const [loading, setLoading] = useState(Boolean(clubId));
  const [active, setActive] = useState(false);

  const refresh = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      setActive(false);
      return;
    }
    setLoading(true);
    try {
      // The date must be explicit: the API falls back to UTC, which resolves to the
      // previous day between midnight and 02:00 in Europe/Madrid.
      const res = await paymentsService.listCashMovementRecords(clubId, localDateYmd());
      setActive(res.session_active === true);
    } catch {
      setActive(false);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, active, refresh };
}

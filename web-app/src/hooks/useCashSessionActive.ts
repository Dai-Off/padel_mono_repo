import { useCallback, useEffect, useState } from 'react';
import { paymentsService } from '../services/payments';

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
      const res = await paymentsService.listCashMovementRecords(clubId);
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

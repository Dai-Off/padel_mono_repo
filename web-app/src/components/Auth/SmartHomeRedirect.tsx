import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../../services/auth';
import { paymentsService } from '../../services/payments';
import { PageSpinner } from '../Layout/PageSpinner';

function localDateYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SmartHomeRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await authService.getMe();
        const clubId = me.clubs?.[0]?.id;
        if (!clubId) { setTarget('/grilla?menu=resumen'); return; }
        const { opening } = await paymentsService.getCashOpeningForDay(clubId, localDateYmd());
        setTarget(opening ? '/grilla?menu=resumen' : '/cierreCaja');
      } catch {
        setTarget('/grilla?menu=resumen');
      }
    })();
  }, []);

  if (!target) return <PageSpinner />;
  return <Navigate to={target} replace />;
}

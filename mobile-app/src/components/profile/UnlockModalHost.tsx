import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeInvalidation } from '../../realtime';
import { fetchPendingUnlocks, markUnlocksSeen, type PendingUnlock } from '../../api/unlockables';
import { UnlockModal } from './UnlockModal';

/**
 * Host del modal global de desbloqueos: monta en la raíz (MainApp) y muestra
 * "¡Desbloqueado!" esté donde esté el usuario. Reacciona a eventos realtime
 * (y fallback) y revisa al volver a primer plano.
 */
interface UnlockModalHostProps {
  /** Navega a la Vitrina (perfil) cuando el usuario pulsa "Ir a mi vitrina". */
  onGoToVitrina?: () => void;
}

export const UnlockModalHost: React.FC<UnlockModalHostProps> = ({ onGoToVitrina }) => {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [queue, setQueue] = useState<PendingUnlock[]>([]);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (!token || checking.current) return;
    checking.current = true;
    try {
      const pending = await fetchPendingUnlocks(token);
      // No interrumpir si ya hay cola mostrándose.
      if (pending.length) setQueue((q) => (q.length ? q : pending));
    } finally {
      checking.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setQueue([]);
      return;
    }
    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => sub.remove();
  }, [token, check]);

  useRealtimeInvalidation(
    'unlockables',
    () => {
      void check();
    },
    { enabled: Boolean(token) },
  );

  const current = queue[0] ?? null;

  const dismiss = useCallback(() => {
    if (!current) return;
    void markUnlocksSeen(token, [current.id]);
    setQueue((q) => q.slice(1));
  }, [current, token]);

  const handleGoToVitrina = useCallback(() => {
    dismiss();
    onGoToVitrina?.();
  }, [dismiss, onGoToVitrina]);

  if (!current) return null;
  return <UnlockModal unlock={current} onClose={dismiss} onGoToVitrina={handleGoToVitrina} />;
};

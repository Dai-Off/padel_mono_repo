import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { startFallbackPolling, stopFallbackPolling } from './fallbackPolling';
import {
  connectSupabaseRealtime,
  disconnectSupabaseRealtime,
  subscribeRealtimeStatus,
  type RealtimeConnectionStatus,
} from './supabaseRealtime';

type RealtimeContextValue = {
  status: RealtimeConnectionStatus;
  isConnected: boolean;
  isEnabled: boolean;
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function isRealtimeConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const isEnabled = isRealtimeConfigured();
  const [status, setStatus] = useState<RealtimeConnectionStatus>(
    isEnabled ? 'connecting' : 'disabled',
  );

  useEffect(() => {
    if (!isEnabled) {
      disconnectSupabaseRealtime();
      stopFallbackPolling();
      return;
    }
    return subscribeRealtimeStatus(setStatus);
  }, [isEnabled]);

  const syncConnection = useCallback(async () => {
    if (!isEnabled) return;
    if (!session?.access_token) {
      disconnectSupabaseRealtime();
      stopFallbackPolling();
      return;
    }
    await connectSupabaseRealtime({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }, [isEnabled, session?.access_token, session?.refresh_token]);

  // Conectar / reconectar al cambiar sesión.
  useEffect(() => {
    void syncConnection();
  }, [syncConnection]);

  // Renovar auth del socket cuando el token se refresca en foreground.
  useEffect(() => {
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const prev = last;
      last = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        void syncConnection();
      }
    });
    return () => sub.remove();
  }, [syncConnection]);

  // Fallback centralizado: solo cuando realtime no está conectado.
  useEffect(() => {
    if (!isEnabled || !session?.access_token) {
      stopFallbackPolling();
      return;
    }
    if (status === 'connected') {
      stopFallbackPolling();
    } else if (status === 'error' || status === 'disabled') {
      startFallbackPolling();
    }
    return () => stopFallbackPolling();
  }, [isEnabled, session?.access_token, status]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      isConnected: status === 'connected',
      isEnabled,
    }),
    [status, isEnabled],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}

import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { refreshSession as refreshSessionApi } from '../api/auth';

const SESSION_KEY = '@padel_session';

/** expires_at: Unix segundos (Supabase session), opcional en sesiones guardadas antes del refresh. */
export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at?: number; // timestamp en segundos (de Supabase)
  user: { id: string; email: string; user_metadata?: { full_name?: string } };
};

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (s: Session | null) => void;
  logout: () => Promise<void>;
  /** Renueva tokens con refresh_token; devuelve el nuevo access_token o null. Actualiza estado y AsyncStorage si ok. */
  refreshAccessToken: () => Promise<string | null>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const REFRESH_BUFFER_MS = 120_000;

function sessionNeedsRefresh(s: Session): boolean {
  if (!s.refresh_token) return false;
  const expSec = s.expires_at;
  if (expSec == null || !Number.isFinite(expSec)) return true;
  return expSec * 1000 < Date.now() + REFRESH_BUFFER_MS;
}

function sessionIsExpired(s: Session): boolean {
  const expSec = s.expires_at;
  if (expSec == null || !Number.isFinite(expSec)) return false;
  return expSec * 1000 <= Date.now();
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const setSession = useCallback((s: Session | null) => {
    setSessionState(s);
    if (s) {
      AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } else {
      AsyncStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current?.refresh_token) return null;
    const res = await refreshSessionApi(current.refresh_token);
    if (!res.ok || !res.session?.access_token || !res.session.refresh_token || !res.user?.id) {
      if (res.httpStatus === 401 || (current && sessionIsExpired(current))) {
        setSession(null);
      }
      return null;
    }
    const next: Session = {
      access_token: res.session.access_token,
      refresh_token: res.session.refresh_token,
      expires_at: res.session.expires_at,
      user: {
        id: res.user.id,
        email: res.user.email,
        user_metadata: res.user.user_metadata,
      },
    };
    setSession(next);
    return next.access_token;
  }, [setSession]);

  // Carga inicial de sesión
  useEffect(() => {
    let mounted = true;
    let done = false;

    const MIN_SPLASH_MS = 2800;
    const finish = () => {
      if (mounted && !done) {
        done = true;
        setIsLoading(false);
      }
    };

    const authCheck = (async () => {
      let stored: string | null = null;
      try {
        stored = await AsyncStorage.getItem(SESSION_KEY);
      } catch {
        return;
      }
      if (!mounted || !stored) return;

      let parsed: Session;
      try {
        parsed = JSON.parse(stored) as Session;
      } catch {
        await AsyncStorage.removeItem(SESSION_KEY);
        return;
      }
      if (!parsed.access_token || !parsed.user?.email) return;

      if (sessionNeedsRefresh(parsed)) {
        const res = await refreshSessionApi(parsed.refresh_token);
        if (
          res.ok &&
          res.session?.access_token &&
          res.session.refresh_token &&
          res.user?.id
        ) {
          if (!mounted) return;
          const next: Session = {
            access_token: res.session.access_token,
            refresh_token: res.session.refresh_token,
            expires_at: res.session.expires_at,
            user: {
              id: res.user.id,
              email: res.user.email,
              user_metadata: res.user.user_metadata,
            },
          };
          setSessionState(next);
          await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
          return;
        }
        /** 401: refresh revocado/expirado. Red u otros: conservar sesión guardada. */
        if (res.httpStatus === 401 || sessionIsExpired(parsed)) {
          await AsyncStorage.removeItem(SESSION_KEY);
          if (mounted) setSessionState(null);
        } else if (mounted) {
          setSessionState(parsed);
        }
        return;
      }

      if (mounted) setSessionState(parsed);
    })().catch(() => {});

    const minSplash = new Promise<void>((r) => setTimeout(r, MIN_SPLASH_MS));

    Promise.all([authCheck, minSplash]).finally(finish);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let lastAppState: AppStateStatus = AppState.currentState;

    const onChange = (next: AppStateStatus) => {
      const prev = lastAppState;
      lastAppState = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        const s = sessionRef.current;
        if (s && sessionNeedsRefresh(s)) {
          void refreshAccessToken();
        }
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [refreshAccessToken]);

  const logout = useCallback(async () => {
    setSessionState(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  }, []);

  // Lógica de autorefresh de token (revisión proactiva)
  useEffect(() => {
    if (!session?.refresh_token || !session?.expires_at) return;

    const checkAndRefresh = async () => {
      if (sessionNeedsRefresh(session)) {
        console.log('[AuthContext] Refrescando sesión proactivamente...');
        await refreshAccessToken();
      }
    };

    // Revisar cada minuto
    const interval = setInterval(checkAndRefresh, 60000);
    checkAndRefresh(); // Revisar al montar

    return () => clearInterval(interval);
  }, [session, refreshAccessToken]);

  const value: AuthContextValue = {
    session,
    isAuthenticated: !!session,
    isLoading,
    setSession,
    logout,
    refreshAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthProviderInner>{children}</AuthProviderInner>;
}

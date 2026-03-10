import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const SESSION_KEY = '@padel_session';

type Session = {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; user_metadata?: { full_name?: string } };
};

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (s: Session | null) => void;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

    const authCheck = AsyncStorage.getItem(SESSION_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as Session;
            if (parsed.access_token && parsed.user?.email) {
              setSessionState(parsed);
            }
          } catch {
            AsyncStorage.removeItem(SESSION_KEY);
          }
        }
      })
      .catch(() => {});

    const minSplash = new Promise<void>((r) => setTimeout(r, MIN_SPLASH_MS));

    Promise.all([authCheck, minSplash]).finally(finish);

    return () => {
      mounted = false;
    };
  }, []);

  const setSession = useCallback((s: Session | null) => {
    setSessionState(s);
    if (s) {
      AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } else {
      AsyncStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const logout = useCallback(async () => {
    setSessionState(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  }, []);

  const value: AuthContextValue = {
    session,
    isAuthenticated: !!session,
    isLoading,
    setSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthProviderInner>{children}</AuthProviderInner>;
}

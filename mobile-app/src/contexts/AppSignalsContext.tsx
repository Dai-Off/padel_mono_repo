import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { goToMainTab } from '../navigation/nav';
import { useRefreshMatches } from '../queries/matches';

/** Secciones de origen del cuestionario de nivelacion (retorno post-onboarding). */
export type PostOnboardingReturn =
  | 'home'
  | 'daily-lesson'
  | 'ia-afinidad'
  | 'matchmaking'
  | 'partido-detail'
  | 'torneos'
  | 'cursos';

type AppSignalsValue = {
  /** Señal tras guardar perfil o fijar username. Ya no remonta ProfileScreen
   * (los datos van por React Query + invalidaciones); la consume
   * UsernameSetupHost para re-comprobar si falta username. */
  profileRefreshKey: number;
  bumpProfileRefresh: () => void;
  /** Pide a ProfileScreen scroll a la Vitrina de Logros. */
  vitrinaScrollNonce: number;
  bumpVitrinaScroll: () => void;
  /** Fuerza otro fetch de racha/pase en Inicio (al salir de la leccion diaria). */
  streakRefreshKey: number;
  bumpStreakRefresh: () => void;
  /** Refresca las listas de partidos (y "mis partidos" de Home). */
  partidosRefreshNonce: number;
  bumpPartidosRefresh: () => void;
  /** Pide a Home reabrir el modal de IA Afinidad al volver del perfil. */
  affinityReopenSignal: number;
  bumpAffinityReopen: () => void;
  clearAffinityReopen: () => void;
  /** Torneo pendiente de abrir en el tab de torneos (deep link de invitacion). */
  pendingTournamentId: string | null;
  setPendingTournamentId: (id: string | null) => void;
  /** ProfileScreen abre el cuestionario de nivelacion automaticamente al montar. */
  autoOpenOnboarding: boolean;
  setAutoOpenOnboarding: (value: boolean) => void;
  /** Seccion de origen a la que volver al completar el cuestionario. */
  pendingOnboardingReturn: PostOnboardingReturn | null;
  setPendingOnboardingReturn: (value: PostOnboardingReturn | null) => void;
  /** Abre el cuestionario en el perfil recordando la seccion de origen. */
  openOnboardingFromSection: (returnTo: PostOnboardingReturn) => void;
};

const AppSignalsContext = createContext<AppSignalsValue | null>(null);

/**
 * Senales cruzadas entre pantallas (antes estado suelto de MainApp). Son
 * eventos puntuales (guardar perfil, completar leccion...), no estado
 * caliente: un bump re-renderiza solo a los tabs que consumen la senal.
 */
export function AppSignalsProvider({ children }: { children: ReactNode }) {
  const refreshMatches = useRefreshMatches();

  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [vitrinaScrollNonce, setVitrinaScrollNonce] = useState(0);
  const [streakRefreshKey, setStreakRefreshKey] = useState(0);
  const [partidosRefreshNonce, setPartidosRefreshNonce] = useState(0);
  const [affinityReopenSignal, setAffinityReopenSignal] = useState(0);
  const [pendingTournamentId, setPendingTournamentId] = useState<string | null>(null);
  const [autoOpenOnboarding, setAutoOpenOnboarding] = useState(false);
  const [pendingOnboardingReturn, setPendingOnboardingReturn] =
    useState<PostOnboardingReturn | null>(null);

  // Cada refresco de partidos revalida tambien "mis partidos" (carrusel Home).
  useEffect(() => {
    if (partidosRefreshNonce < 1) return;
    void refreshMatches({ force: true, scope: 'mine' });
  }, [partidosRefreshNonce, refreshMatches]);

  const openOnboardingFromSection = useCallback((returnTo: PostOnboardingReturn) => {
    setPendingOnboardingReturn(returnTo);
    setAutoOpenOnboarding(true);
    goToMainTab('perfil');
  }, []);

  // Bumps con identidad estable: se consumen en efectos (beforeRemove, etc.).
  const bumpProfileRefresh = useCallback(() => setProfileRefreshKey((k) => k + 1), []);
  const bumpVitrinaScroll = useCallback(() => setVitrinaScrollNonce((n) => n + 1), []);
  const bumpStreakRefresh = useCallback(() => setStreakRefreshKey((k) => k + 1), []);
  const bumpPartidosRefresh = useCallback(() => setPartidosRefreshNonce((n) => n + 1), []);
  const bumpAffinityReopen = useCallback(() => setAffinityReopenSignal((s) => s + 1), []);
  const clearAffinityReopen = useCallback(() => setAffinityReopenSignal(0), []);

  const value = useMemo<AppSignalsValue>(
    () => ({
      profileRefreshKey,
      bumpProfileRefresh,
      vitrinaScrollNonce,
      bumpVitrinaScroll,
      streakRefreshKey,
      bumpStreakRefresh,
      partidosRefreshNonce,
      bumpPartidosRefresh,
      affinityReopenSignal,
      bumpAffinityReopen,
      clearAffinityReopen,
      pendingTournamentId,
      setPendingTournamentId,
      autoOpenOnboarding,
      setAutoOpenOnboarding,
      pendingOnboardingReturn,
      setPendingOnboardingReturn,
      openOnboardingFromSection,
    }),
    [
      profileRefreshKey,
      bumpProfileRefresh,
      vitrinaScrollNonce,
      bumpVitrinaScroll,
      streakRefreshKey,
      bumpStreakRefresh,
      partidosRefreshNonce,
      bumpPartidosRefresh,
      affinityReopenSignal,
      bumpAffinityReopen,
      clearAffinityReopen,
      pendingTournamentId,
      autoOpenOnboarding,
      pendingOnboardingReturn,
      openOnboardingFromSection,
    ],
  );

  return <AppSignalsContext.Provider value={value}>{children}</AppSignalsContext.Provider>;
}

export function useAppSignals(): AppSignalsValue {
  const ctx = useContext(AppSignalsContext);
  if (!ctx) {
    throw new Error('useAppSignals must be used within AppSignalsProvider');
  }
  return ctx;
}

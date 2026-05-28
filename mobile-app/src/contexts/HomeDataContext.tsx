import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { fetchMatches, fetchMyMatches, type MatchEnriched } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyPlayerId, fetchMyPlayerProfile, type MyPlayerProfile } from '../api/players';
import { fetchPublicTournaments } from '../api/tournaments';
import { fetchSeasonPassMe, type SeasonPassMeOk } from '../api/seasonPass';
import { fetchHomeStats, type HomeStats } from '../api/home';
import { fetchStreak, type StreakInfo } from '../api/dailyLessons';
import { getMatchBooking, getMatchListPhase } from '../domain/matchLifecycle';
import { selectMyMatchesForHome } from '../domain/selectMyUpcomingMatches';
import { normalizeMatchEnriched } from '../api/normalizeMatch';
import { useAuth } from './AuthContext';
import type { PartidoItem } from '../screens/PartidosScreen';

import { CLUB_IANA_TIMEZONE } from '../lib/clubTimeZone';

const TIMEZONE = CLUB_IANA_TIMEZONE;

type StreakState = {
  currentStreak: number;
  longestStreak: number;
  multiplier: number;
  lastCompleted: string | null;
};

/**
 * TTL global de cache (60 s). Si pides datos antes de que pasen, devolvemos
 * cache sin re-fetch. Pasado el TTL, el siguiente acceso revalida.
 *
 * 60 s es un buen punto medio para esta app: el perfil cambia rara vez, los
 * partidos y torneos cambian cada minutos, no segundos. Si necesitas datos
 * frescos tras una acción del usuario (crear partido, completar lección),
 * llama al `refresh*` correspondiente para forzar.
 */
const TTL_MS = 60 * 1000;

type HomeDataValue = {
  // Profile
  profile: MyPlayerProfile | null;
  profileLoading: boolean;
  refreshProfile: (opts?: { force?: boolean }) => Promise<void>;

  // Matches (datos derivados ya mapeados a PartidoItem para HomeScreen).
  partidos: PartidoItem[];
  misPartidos: PartidoItem[];
  matchesLoading: boolean;
  refreshMatches: (opts?: { force?: boolean }) => Promise<void>;

  // Tournaments (solo el count, que es lo que usa el home).
  publicTournamentsCount: number | null;
  tournamentsLoading: boolean;
  refreshTournaments: (opts?: { force?: boolean }) => Promise<void>;

  // Season Pass
  seasonPassMe: SeasonPassMeOk | null;
  seasonPassLoading: boolean;
  refreshSeasonPass: (opts?: { force?: boolean }) => Promise<void>;

  // Home stats (count pistas libres + jugadores) — quick actions del home.
  stats: HomeStats | null;
  statsLoading: boolean;
  refreshStats: (opts?: { force?: boolean }) => Promise<void>;

  // Racha de la lección diaria (current/longest/multiplier/lastCompleted).
  streak: StreakState;
  streakLoading: boolean;
  refreshStreak: (opts?: { force?: boolean }) => Promise<void>;

  /**
   * `true` si en algún momento un fetch ha fallado y todavía NO tenemos datos
   * cargados de ese dataset (= primera carga falló). Se usa para mostrar un
   * banner discreto "No se pudo cargar — Reintentar" en la pantalla, en lugar
   * de cards vacías sin contexto.
   *
   * Política silenciosa: las revalidaciones fallidas con datos previos en
   * cache NO suben este flag — se quedan los datos viejos sin avisar al
   * usuario (patrón stale-while-error).
   */
  hasInitialError: boolean;
  /** Re-fetch forzado de todos los datasets. CTA del banner de error. */
  refreshAll: () => Promise<void>;
};

const HomeDataContext = createContext<HomeDataValue | null>(null);

/**
 * Provider que mantiene cache en memoria de los datos del Home (profile,
 * partidos, torneos, season pass). Vive a nivel de `MainApp`, así que los
 * datos sobreviven a remounts de `HomeScreen` cuando el usuario navega a
 * Profile / DailyLesson / etc. y vuelve.
 *
 * Patrón típico: stale-while-revalidate manual.
 *   - Primera vez: fetch (loading true).
 *   - Mientras dentro de TTL: devuelve cache (no re-fetch, loading false).
 *   - Pasado TTL: siguiente refresh re-fetch en background sin loading
 *     visible si ya hay datos.
 *   - `force: true` ignora el TTL — usar tras mutaciones (crear partido,
 *     completar lección, completar onboarding).
 *
 * Al volver del background (AppState 'active'), refrescamos todo respetando
 * TTL. Cubre el caso de "abrir la app tras estar fuera 5 min".
 */
export function HomeDataProvider({ children }: { children: ReactNode }) {
  const { session, refreshAccessToken } = useAuth();
  const token = session?.access_token ?? null;

  const [profile, setProfile] = useState<MyPlayerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileLoadedAt = useRef(0);

  const [partidos, setPartidos] = useState<PartidoItem[]>([]);
  const [misPartidos, setMisPartidos] = useState<PartidoItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const matchesLoadedAt = useRef(0);

  const [publicTournamentsCount, setPublicTournamentsCount] = useState<number | null>(null);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const tournamentsLoadedAt = useRef(0);

  const [seasonPassMe, setSeasonPassMe] = useState<SeasonPassMeOk | null>(null);
  const [seasonPassLoading, setSeasonPassLoading] = useState(false);
  const seasonPassLoadedAt = useRef(0);

  const [stats, setStats] = useState<HomeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const statsLoadedAt = useRef(0);

  const [streak, setStreak] = useState<StreakState>({
    currentStreak: 0,
    longestStreak: 0,
    multiplier: 0,
    lastCompleted: null,
  });
  const [streakLoading, setStreakLoading] = useState(false);
  const streakLoadedAt = useRef(0);

  /**
   * Indica si la PRIMERA carga de cualquiera de los datasets falló y aún no
   * tenemos datos. Permite a HomeScreen mostrar un banner de error en lugar
   * de cards vacías sin contexto. Cuando llegan datos válidos vuelve a false.
   */
  const [hasInitialError, setHasInitialError] = useState(false);

  // -----------------------------------------------------------------
  // Refrescos (uno por entidad). Todos respetan TTL salvo `force: true`.
  // Política: si la primera carga (sin datos previos) falla, marcamos el
  // flag global. Si la revalidación con datos previos falla, silencio.
  // -----------------------------------------------------------------

  const refreshProfile = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!token) {
        setProfile(null);
        return;
      }
      if (!force && Date.now() - profileLoadedAt.current < TTL_MS) return;
      // Solo mostramos loading si no había nada cacheado.
      const isFirst = profileLoadedAt.current === 0;
      if (isFirst) setProfileLoading(true);
      try {
        const p = await fetchMyPlayerProfile(token);
        setProfile(p);
        profileLoadedAt.current = Date.now();
        if (p == null && isFirst) setHasInitialError(true);
      } catch {
        if (isFirst) setHasInitialError(true);
      } finally {
        if (isFirst) setProfileLoading(false);
      }
    },
    [token],
  );

  const refreshMatches = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!token) {
        setMisPartidos([]);
        setPartidos([]);
        return;
      }
      if (!force && Date.now() - matchesLoadedAt.current < TTL_MS) return;
      const isFirst = matchesLoadedAt.current === 0;
      if (isFirst) setMatchesLoading(true);

      try {
        let tk: string | null = token;
        let [playerId, matches, myMatches] = await Promise.all([
          fetchMyPlayerId(tk),
          fetchMatches({ expand: true, token: tk, activeOnly: false }),
          fetchMyMatches(tk, { phase: 'all', limit: 100 }),
        ]);

        // Si el token caducó silenciosamente, reintentamos UNA vez con refresh.
        if (!playerId && session?.refresh_token) {
          const newToken = await refreshAccessToken();
          if (newToken) {
            tk = newToken;
            [playerId, matches, myMatches] = await Promise.all([
              fetchMyPlayerId(newToken),
              fetchMatches({ expand: true, token: newToken, activeOnly: false }),
              fetchMyMatches(newToken, { phase: 'all', limit: 100 }),
            ]);
          }
        }

        let mineSource = (myMatches as MatchEnriched[]).map(normalizeMatchEnriched);
        // Fallback: si /matches/mine viene vacío (error silencioso, desfase de API, etc.),
        // reconstruir desde el listado expandido filtrando por jugador.
        if (playerId && mineSource.length === 0) {
          mineSource = selectMyMatchesForHome(
            (matches as MatchEnriched[]).map(normalizeMatchEnriched),
            playerId,
          );
        }

        const mineRawBase = mineSource.filter((m) => {
          const b = getMatchBooking(m);
          return Boolean(b?.start_at && b?.end_at);
        });
        const mineVisible = mineRawBase.filter((m) => {
          const b = getMatchBooking(m)!;
          const phase = getMatchListPhase(Date.now(), m.status, b.start_at, b.end_at);
          const hasMyFeedback = (m as MatchEnriched & { has_my_feedback?: boolean }).has_my_feedback === true;
          // Regla de negocio Home: si el partido ya finalizó y el usuario ya
          // dejó feedback, se oculta del carrusel "Mis partidos".
          return !(phase === 'past' && hasMyFeedback);
        });
        const mineRaw = [
          ...mineVisible
            .filter((m) => {
              const b = getMatchBooking(m)!;
              return getMatchListPhase(Date.now(), m.status, b.start_at, b.end_at) !== 'past';
            })
            .sort(
              (a, b) =>
                new Date(getMatchBooking(a)!.start_at!).getTime() -
                new Date(getMatchBooking(b)!.start_at!).getTime(),
            ),
          ...mineVisible
            .filter((m) => {
              const b = getMatchBooking(m)!;
              return getMatchListPhase(Date.now(), m.status, b.start_at, b.end_at) === 'past';
            })
            .sort(
              (a, b) =>
                new Date(getMatchBooking(b)!.start_at!).getTime() -
                new Date(getMatchBooking(a)!.start_at!).getTime(),
            ),
        ];
        const mis = mineRaw
          .map(mapMatchToPartido)
          .filter((p): p is PartidoItem => p != null);
        setMisPartidos(mis);

        const all = (matches as MatchEnriched[])
          .map(mapMatchToPartido)
          .filter((p): p is PartidoItem => p != null)
          .filter((p) => p.matchPhase !== 'past');
        setPartidos(all);

        matchesLoadedAt.current = Date.now();
      } catch {
        if (isFirst) setHasInitialError(true);
      } finally {
        if (isFirst) setMatchesLoading(false);
      }
    },
    [token, session?.refresh_token, refreshAccessToken],
  );

  const refreshTournaments = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force && Date.now() - tournamentsLoadedAt.current < TTL_MS) return;
      const isFirst = tournamentsLoadedAt.current === 0;
      if (isFirst) setTournamentsLoading(true);
      try {
        const r = await fetchPublicTournaments(token);
        if (r.ok) {
          setPublicTournamentsCount(r.tournaments.length);
        } else if (isFirst) {
          setHasInitialError(true);
        }
        tournamentsLoadedAt.current = Date.now();
      } catch {
        if (isFirst) setHasInitialError(true);
      } finally {
        if (isFirst) setTournamentsLoading(false);
      }
    },
    [token],
  );

  const refreshSeasonPass = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!token) {
        setSeasonPassMe(null);
        return;
      }
      if (!force && Date.now() - seasonPassLoadedAt.current < TTL_MS) return;
      const isFirst = seasonPassLoadedAt.current === 0;
      if (isFirst) setSeasonPassLoading(true);
      try {
        const tz = CLUB_IANA_TIMEZONE;
        /** No refrescamos token ante 4xx/5xx: si /season-pass/me falla (p. ej.
         * 500 sin migración 050), refrescar token cambia access_token, re-dispara
         * efectos y entra en bucle infinito. */
        const data = await fetchSeasonPassMe(token, tz);
        setSeasonPassMe(data);
        seasonPassLoadedAt.current = Date.now();
        // No tocamos hasInitialError aquí: el season pass puede dar 500 sin
        // migración aplicada en clubs en desarrollo, no es bloqueante para
        // el Home. Las cards principales (profile, matches, tournaments)
        // mandan en este flag.
      } catch {
        // Silencioso, mismo motivo.
      } finally {
        if (isFirst) setSeasonPassLoading(false);
      }
    },
    [token],
  );

  const refreshStats = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force && Date.now() - statsLoadedAt.current < TTL_MS) return;
      const isFirst = statsLoadedAt.current === 0;
      if (isFirst) setStatsLoading(true);
      try {
        const data = await fetchHomeStats(token);
        setStats(data);
      } catch {
        // Fallback consistente con el comportamiento del antiguo useHomeStats.
        setStats({ courtsFree: 0, playersLooking: 0, classesToday: 0, tournaments: 0 });
      }
      statsLoadedAt.current = Date.now();
      if (isFirst) setStatsLoading(false);
    },
    [token],
  );

  const refreshStreak = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!token) return;
      if (!force && Date.now() - streakLoadedAt.current < TTL_MS) return;
      const isFirst = streakLoadedAt.current === 0;
      if (isFirst) setStreakLoading(true);
      try {
        const res = await fetchStreak(token, TIMEZONE);
        if ('ok' in res && res.ok === false) {
          // 401/500: dejamos los valores previos (o defaults) y no rompemos.
        } else {
          const data = res as StreakInfo;
          setStreak({
            currentStreak: data.current_streak,
            longestStreak: data.longest_streak,
            multiplier: data.multiplier,
            lastCompleted: data.last_lesson_completed_at,
          });
        }
      } catch {
        // Silencioso. Mantiene valores previos.
      }
      streakLoadedAt.current = Date.now();
      if (isFirst) setStreakLoading(false);
    },
    [token],
  );

  /**
   * Re-fetch forzado de todos los datasets. CTA del banner "Reintentar"
   * cuando la primera carga falló. También útil para pull-to-refresh.
   *
   * Resetea `hasInitialError` optimistamente: si alguno vuelve a fallar
   * sin datos previos, su `setHasInitialError(true)` lo vuelve a marcar.
   */
  const refreshAll = useCallback(async () => {
    setHasInitialError(false);
    await Promise.all([
      refreshProfile({ force: true }),
      refreshMatches({ force: true }),
      refreshTournaments({ force: true }),
      refreshSeasonPass({ force: true }),
      refreshStats({ force: true }),
      refreshStreak({ force: true }),
    ]);
  }, [
    refreshProfile,
    refreshMatches,
    refreshTournaments,
    refreshSeasonPass,
    refreshStats,
    refreshStreak,
  ]);

  // -----------------------------------------------------------------
  // Auto-fetch inicial al montar / al cambiar de token.
  // Resetea timestamps para forzar primera carga "loading visible".
  // -----------------------------------------------------------------
  useEffect(() => {
    // Reset al cambiar de sesión.
    profileLoadedAt.current = 0;
    matchesLoadedAt.current = 0;
    tournamentsLoadedAt.current = 0;
    seasonPassLoadedAt.current = 0;
    statsLoadedAt.current = 0;
    streakLoadedAt.current = 0;
    setHasInitialError(false);
    if (!token) {
      setProfile(null);
      setPartidos([]);
      setMisPartidos([]);
      setPublicTournamentsCount(null);
      setSeasonPassMe(null);
      setStats(null);
      setStreak({ currentStreak: 0, longestStreak: 0, multiplier: 0, lastCompleted: null });
      return;
    }
    void refreshProfile({ force: true });
    void refreshMatches({ force: true });
    void refreshTournaments({ force: true });
    void refreshSeasonPass({ force: true });
    void refreshStats({ force: true });
    void refreshStreak({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // -----------------------------------------------------------------
  // Al volver del background, refrescar todo (respetando TTL).
  // -----------------------------------------------------------------
  useEffect(() => {
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const prev = last;
      last = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        void refreshProfile();
        void refreshMatches();
        void refreshTournaments();
        void refreshSeasonPass();
        void refreshStats();
        void refreshStreak();
      }
    });
    return () => sub.remove();
  }, [
    refreshProfile,
    refreshMatches,
    refreshTournaments,
    refreshSeasonPass,
    refreshStats,
    refreshStreak,
  ]);

  const value = useMemo<HomeDataValue>(
    () => ({
      profile,
      profileLoading,
      refreshProfile,
      partidos,
      misPartidos,
      matchesLoading,
      refreshMatches,
      publicTournamentsCount,
      tournamentsLoading,
      refreshTournaments,
      seasonPassMe,
      seasonPassLoading,
      refreshSeasonPass,
      stats,
      statsLoading,
      refreshStats,
      streak,
      streakLoading,
      refreshStreak,
      hasInitialError,
      refreshAll,
    }),
    [
      profile,
      profileLoading,
      refreshProfile,
      partidos,
      misPartidos,
      matchesLoading,
      refreshMatches,
      publicTournamentsCount,
      tournamentsLoading,
      refreshTournaments,
      seasonPassMe,
      seasonPassLoading,
      refreshSeasonPass,
      stats,
      statsLoading,
      refreshStats,
      streak,
      streakLoading,
      refreshStreak,
      hasInitialError,
      refreshAll,
    ],
  );

  return <HomeDataContext.Provider value={value}>{children}</HomeDataContext.Provider>;
}

export function useHomeData(): HomeDataValue {
  const ctx = useContext(HomeDataContext);
  if (!ctx) {
    throw new Error('useHomeData must be used within HomeDataProvider');
  }
  return ctx;
}

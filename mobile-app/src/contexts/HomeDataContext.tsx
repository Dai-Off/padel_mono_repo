import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchMyPlayerProfile, type MyPlayerProfile } from '../api/players';
import { useMyProfile } from '../queries/profile';
import {
  DEFAULT_STREAK,
  useDailyStreak,
  useHomeStats,
  useMyCourtReservations,
  usePublicTournamentsCount,
  type StreakState,
} from '../queries/home';
import {
  clearMisPartidosRegistry,
  useMisPartidos,
  useMisPartidosActions,
  usePartidosDiscovery,
} from '../queries/matches';
import { homeKeys, matchesKeys, profileKeys } from '../queries/keys';
import { type HomeStats } from '../api/home';
import { type CourtReservation } from '../api/bookings';
import { isPartidoCancelled } from '../domain/matchLifecycle';
import {
  cachePlayerAvatar,
  enrichPartidoWithProfileAvatar,
  enrichPartidosWithProfileAvatar,
  type ProfileForPartidoEnrich,
} from '../lib/partidoPlayerUtils';
import { reloadMatchPartido } from '../lib/reloadMatchPartido';
import { useAuth } from './AuthContext';
import type { PartidoItem } from '../screens/PartidosScreen';

/** Identidad estable para el estado vacío (evita re-renders por `?? []`). */
const EMPTY_RESERVATIONS: CourtReservation[] = [];
const EMPTY_PARTIDOS: PartidoItem[] = [];

/** Throttle (3s) de las revalidaciones 'mine' sin force tras mutaciones. */
const lastMineRefreshAtByUser = new Map<string, number>();
const MINE_REFRESH_THROTTLE_MS = 3000;

type HomeDataValue = {
  // Profile
  profile: MyPlayerProfile | null;
  profileLoading: boolean;
  refreshProfile: (opts?: { force?: boolean }) => Promise<void>;

  // Matches (datos derivados ya mapeados a PartidoItem para HomeScreen).
  partidos: PartidoItem[];
  misPartidos: PartidoItem[];
  matchesLoading: boolean;
  refreshMatches: (opts?: { force?: boolean; scope?: 'full' | 'mine' }) => Promise<void>;
  /** Actualiza el carrusel "Mis partidos" al instante (p. ej. tras unirse a un partido). */
  upsertMisPartido: (item: PartidoItem) => void;
  /** Quita un partido del carrusel (p. ej. tras cancelar o salir). */
  removeMisPartido: (matchId: string) => void;
  /** Tras crear/unirse: carga el partido, lo inserta en Home y revalida con el servidor. */
  syncMisPartidoFromMatchId: (
    matchId: string,
    opts?: {
      organizerPlayerId?: string | null;
      forceSlotIndex?: number;
      matchVisibility?: 'public' | 'private';
    },
  ) => Promise<void>;

  // Reservas de pista privada (standard) — flujo aparte de partidos.
  misReservasPista: CourtReservation[];
  courtReservationsLoading: boolean;
  refreshCourtReservations: (opts?: { force?: boolean }) => Promise<void>;

  // Tournaments (solo el count, que es lo que usa el home).
  publicTournamentsCount: number | null;
  tournamentsLoading: boolean;
  refreshTournaments: (opts?: { force?: boolean }) => Promise<void>;

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
 * Provider de datos del Home. Revalidaciones tras la primera carga son
 * silenciosas (sin skeleton). `force: true` o `scope: 'mine'` tras mutaciones.
 */
export function HomeDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const lastSessionUserIdRef = useRef<string | null>(null);
  const token = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;

  // Perfil base: la fuente de verdad es la query (persistida en PERSIST_ROOTS).
  // El contexto lo expone como fachada mientras sus consumidores migran a
  // useMyProfile() — sin estado duplicado aquí.
  const queryClient = useQueryClient();
  const profileQuery = useMyProfile();
  const profile: MyPlayerProfile | null = profileQuery.data ?? null;
  const profileLoading = profileQuery.isLoading;

  // Matches: fuente de verdad en React Query (queries/matches.ts, con el merge
  // de upserts optimistas dentro del queryFn); fachada como el resto.
  const misPartidosQuery = useMisPartidos();
  const misPartidos: PartidoItem[] = misPartidosQuery.data ?? EMPTY_PARTIDOS;
  const discoveryQuery = usePartidosDiscovery();
  const partidos: PartidoItem[] = discoveryQuery.data ?? EMPTY_PARTIDOS;
  const matchesLoading = misPartidosQuery.isLoading || discoveryQuery.isLoading;
  const { upsertMisPartido, removeMisPartido } = useMisPartidosActions();

  // Reservas de pista: fuente de verdad en React Query, fachada como el resto.
  const courtReservationsQuery = useMyCourtReservations();
  const misReservasPista: CourtReservation[] = courtReservationsQuery.data ?? EMPTY_RESERVATIONS;
  const courtReservationsLoading = courtReservationsQuery.isLoading;

  // Torneos (count): fuente de verdad en React Query, fachada como el resto.
  const tournamentsQuery = usePublicTournamentsCount();
  const publicTournamentsCount: number | null = tournamentsQuery.data ?? null;
  const tournamentsLoading = tournamentsQuery.isLoading;

  // Stats + racha: fuente de verdad en React Query (queries/home.ts); el
  // contexto las expone como fachada mientras migran sus consumidores.
  const statsQuery = useHomeStats();
  const stats: HomeStats | null = statsQuery.data ?? null;
  const statsLoading = statsQuery.isLoading;

  const streakQuery = useDailyStreak();
  const streak: StreakState = streakQuery.data ?? DEFAULT_STREAK;
  const streakLoading = streakQuery.isLoading;

  /**
   * Banner de error inicial, derivado por completo de las queries: isError sin
   * datos = primera carga fallida; se limpia solo cuando llegan datos válidos.
   * (stats y racha no marcan error a propósito: fallback a ceros / silencioso.)
   */
  const hasInitialError =
    (profileQuery.isError && profileQuery.data == null) ||
    (misPartidosQuery.isError && misPartidosQuery.data == null) ||
    (discoveryQuery.isError && discoveryQuery.data == null) ||
    (courtReservationsQuery.isError && courtReservationsQuery.data == null) ||
    (tournamentsQuery.isError && tournamentsQuery.data == null);

  // -----------------------------------------------------------------
  // Refrescos (uno por entidad). `force: true` siempre re-fetch.
  // -----------------------------------------------------------------

  // Fachada sobre la query: sin force la query gestiona su frescura (staleTime
  // + focusManager); con force invalida y espera el refetch.
  const refreshProfile = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: profileKeys.base(userId) });
    },
    [queryClient, userId],
  );

  const profileForEnrich = useMemo((): ProfileForPartidoEnrich | null => {
    if (!profile?.id) return null;
    return {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      eloRating: profile.eloRating,
    };
  }, [
    profile?.id,
    profile?.firstName,
    profile?.lastName,
    profile?.username,
    profile?.avatarUrl,
    profile?.eloRating,
  ]);

  /** Si el perfil llega después de /matches/mine, rellena avatares sin esperar otro refetch. */
  useEffect(() => {
    if (!profileForEnrich?.id?.trim() || !userId) return;
    cachePlayerAvatar(profileForEnrich.id, profileForEnrich.avatarUrl);
    const key = matchesKeys.mine(userId);
    const prev = queryClient.getQueryData<PartidoItem[]>(key);
    if (!prev?.length) return;
    const next = enrichPartidosWithProfileAvatar(prev, profileForEnrich);
    const same = next.every((p, i) => p === prev[i]);
    if (!same) queryClient.setQueryData(key, next);
  }, [
    profileForEnrich?.id,
    profileForEnrich?.avatarUrl,
    profileForEnrich?.firstName,
    profileForEnrich?.lastName,
    profileForEnrich?.username,
    userId,
    queryClient,
  ]);

  // Fachada sobre las queries de matches. Con force invalida mine (y discovery
  // si el scope es full). Sin force, solo la revalidación post-mutación de
  // 'mine' sigue refetcheando (con throttle de 3s, paridad con el contexto
  // viejo); el resto de frescura la gestionan las queries solas.
  const refreshMatches = useCallback(
    async ({ force = false, scope = 'full' }: { force?: boolean; scope?: 'full' | 'mine' } = {}) => {
      if (!userId) return;
      const mineOnly = scope === 'mine';
      if (!force) {
        if (!mineOnly) return;
        const lastAt = lastMineRefreshAtByUser.get(userId) ?? 0;
        if (Date.now() - lastAt < MINE_REFRESH_THROTTLE_MS) return;
      }
      if (mineOnly) lastMineRefreshAtByUser.set(userId, Date.now());
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: matchesKeys.mine(userId) }),
      ];
      if (!mineOnly) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: matchesKeys.discoveryAll(userId) }),
        );
      }
      await Promise.all(invalidations);
    },
    [queryClient, userId],
  );

  const refreshCourtReservations = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: homeKeys.courtReservations(userId) });
    },
    [queryClient, userId],
  );

  const syncMisPartidoFromMatchId = useCallback(
    async (
      matchId: string,
      opts?: {
        organizerPlayerId?: string | null;
        forceSlotIndex?: number;
        matchVisibility?: 'public' | 'private';
      },
    ) => {
      if (!token || !matchId.trim()) return;

      const freshProfile = await fetchMyPlayerProfile(token);
      const playerId = freshProfile?.id ?? opts?.organizerPlayerId?.trim() ?? profile?.id ?? null;
      if (!playerId) {
        await refreshMatches({ force: true, scope: 'mine' });
        return;
      }

      const profileEnrich: ProfileForPartidoEnrich = {
        id: playerId,
        firstName: freshProfile?.firstName ?? profile?.firstName,
        lastName: freshProfile?.lastName ?? profile?.lastName,
        avatarUrl: freshProfile?.avatarUrl ?? profile?.avatarUrl ?? null,
      };

      const loaded = await reloadMatchPartido(matchId, token, {
        retryIfMissingPlayerId: playerId,
      });
      if (loaded) {
        if (isPartidoCancelled(loaded)) {
          removeMisPartido(matchId);
        } else {
          let enriched = enrichPartidoWithProfileAvatar(loaded, profileEnrich, {
            forceSlotIndex: opts?.forceSlotIndex,
          });
          enriched = {
            ...enriched,
            organizerPlayerId: enriched.organizerPlayerId ?? opts?.organizerPlayerId ?? playerId,
            visibility:
              enriched.visibility ??
              (opts?.matchVisibility === 'private'
                ? 'private'
                : opts?.matchVisibility === 'public'
                  ? 'public'
                  : undefined),
          };
          upsertMisPartido(enriched);
        }
      }

      await refreshMatches({ force: true, scope: 'mine' });

      if (freshProfile && userId) {
        // Siembra el caché de la query base con el perfil recién traído
        // (lo marca fresco: evita otro fetch inmediato).
        queryClient.setQueryData(profileKeys.base(userId), freshProfile);
      }
    },
    [token, userId, queryClient, profile?.id, profile?.firstName, profile?.lastName, profile?.avatarUrl, upsertMisPartido, removeMisPartido, refreshMatches],
  );

  const refreshTournaments = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: homeKeys.tournamentsCount(userId) });
    },
    [queryClient, userId],
  );

  // Fachadas sobre las queries: sin force la query gestiona su frescura;
  // con force invalidan y esperan el refetch.
  const refreshStats = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: homeKeys.stats(userId) });
    },
    [queryClient, userId],
  );

  const refreshStreak = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: homeKeys.streak(userId) });
    },
    [queryClient, userId],
  );

  /**
   * Re-fetch forzado de todos los datasets. CTA del banner "Reintentar"
   * cuando la primera carga falló. También útil para pull-to-refresh.
   * El banner se limpia solo: al llegar datos, los isError derivados caen.
   */
  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshProfile({ force: true }),
      refreshMatches({ force: true }),
      refreshCourtReservations({ force: true }),
      refreshTournaments({ force: true }),
      refreshStats({ force: true }),
      refreshStreak({ force: true }),
    ]);
  }, [
    refreshProfile,
    refreshMatches,
    refreshCourtReservations,
    refreshTournaments,
    refreshStats,
    refreshStreak,
  ]);

  // -----------------------------------------------------------------
  // Logout / cambio de usuario: limpiar el registro de upserts de matches.
  // El caché de queries lo limpian queryClient.clear() (logout) y las keys
  // por userId (cambio de usuario). El resto (bootstrap, background) lo
  // gestiona React Query solo: fetch al montar + focusManager.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (userId) {
      lastSessionUserIdRef.current = userId;
      return;
    }
    clearMisPartidosRegistry(lastSessionUserIdRef.current);
    lastSessionUserIdRef.current = null;
  }, [userId]);

  const value = useMemo<HomeDataValue>(
    () => ({
      profile,
      profileLoading,
      refreshProfile,
      partidos,
      misPartidos,
      matchesLoading,
      refreshMatches,
      upsertMisPartido,
      removeMisPartido,
      syncMisPartidoFromMatchId,
      misReservasPista,
      courtReservationsLoading,
      refreshCourtReservations,
      publicTournamentsCount,
      tournamentsLoading,
      refreshTournaments,
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
      upsertMisPartido,
      removeMisPartido,
      syncMisPartidoFromMatchId,
      misReservasPista,
      courtReservationsLoading,
      refreshCourtReservations,
      publicTournamentsCount,
      tournamentsLoading,
      refreshTournaments,
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

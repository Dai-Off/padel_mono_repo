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
import { fetchMyPlayerProfile, type MyPlayerProfile } from '../api/players';
import { fetchPublicTournaments } from '../api/tournaments';
import { fetchHomeStats, type HomeStats } from '../api/home';
import { fetchMyCourtReservations, type CourtReservation } from '../api/bookings';
import { fetchStreak, type StreakInfo } from '../api/dailyLessons';
import {
  getMatchBooking,
  getMatchListPhase,
  isPartidoCancelled,
} from '../domain/matchLifecycle';
import { normalizeMatchEnriched } from '../api/normalizeMatch';
import { defaultPartidosDiscoveryDateRange } from '../domain/partidosFilters';
import {
  cachePlayerAvatar,
  enrichPartidoWithProfileAvatar,
  enrichPartidosWithProfileAvatar,
  isPartidoOpenForDiscovery,
  mergeMisPartidosFromServer,
  removeMisPartidoFromList,
  upsertMisPartidosList,
  type ProfileForPartidoEnrich,
} from '../lib/partidoPlayerUtils';
import { reloadMatchPartido } from '../lib/reloadMatchPartido';
import { findMisPartidoIdsToRemove } from '../lib/pruneMisPartidos';
import { useAuth } from './AuthContext';
import type { PartidoItem } from '../screens/PartidosScreen';

import { CLUB_IANA_TIMEZONE } from '../lib/clubTimeZone';

const TIMEZONE = CLUB_IANA_TIMEZONE;

/** Evita re-bootstrap si el provider se remonta por un parpadeo de sesión. */
const bootstrappedUserIds = new Set<string>();
/** Cooldown entre refrescos completos al volver del background. */
const lastBackgroundRefreshAtByUser = new Map<string, number>();
const BACKGROUND_REFRESH_COOLDOWN_MS = 30_000;

type StreakState = {
  currentStreak: number;
  longestStreak: number;
  multiplier: number;
  lastCompleted: string | null;
};

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
  const refreshMatchesGen = useRef(0);
  const refreshMatchesInFlight = useRef<Promise<void> | null>(null);
  const token = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;

  const [profile, setProfile] = useState<MyPlayerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileLoadedAt = useRef(0);

  const [partidos, setPartidos] = useState<PartidoItem[]>([]);
  const [misPartidos, setMisPartidos] = useState<PartidoItem[]>([]);
  const [misReservasPista, setMisReservasPista] = useState<CourtReservation[]>([]);
  const [courtReservationsLoading, setCourtReservationsLoading] = useState(false);
  const courtReservationsLoadedAt = useRef(0);
  useEffect(() => {
    misPartidosRef.current = misPartidos;
  }, [misPartidos]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const matchesLoadedAt = useRef(0);
  const refreshMatchesMineAt = useRef(0);
  const profileForEnrichRef = useRef<ProfileForPartidoEnrich | null>(null);
  /** IDs que /matches/mine devolvió alguna vez — si desaparecen, no reinsertar en merge. */
  const everSyncedMisPartidoIdsRef = useRef(new Set<string>());
  /** Upserts locales recientes (crear/unirse) antes de que /mine los confirme. */
  const pendingLocalMisPartidoIdsRef = useRef(new Map<string, number>());
  const misPartidosRef = useRef<PartidoItem[]>([]);

  const [publicTournamentsCount, setPublicTournamentsCount] = useState<number | null>(null);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const tournamentsLoadedAt = useRef(0);

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
  // Refrescos (uno por entidad). `force: true` siempre re-fetch.
  // -----------------------------------------------------------------

  const refreshProfile = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!token) {
        setProfile(null);
        return;
      }
      if (!force && profileLoadedAt.current > 0) return;
      // Solo mostramos loading si no había nada cacheado.
      const isFirst = profileLoadedAt.current === 0;
      if (isFirst) setProfileLoading(true);
      try {
        const p = await fetchMyPlayerProfile(token);
        if (p?.id) cachePlayerAvatar(p.id, p.avatarUrl);
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

  /** Solo datos de GET /matches/mine — nunca el listado público de /matches. */
  const buildMisPartidosFromMatches = useCallback(
    (mineSource: MatchEnriched[], playerProfile: ProfileForPartidoEnrich | null) => {
      const mineRawBase = mineSource.filter((m) => {
        const b = getMatchBooking(m);
        return Boolean(b?.start_at && b?.end_at);
      });
      const mineVisible = mineRawBase.filter((m) => {
        const b = getMatchBooking(m);
        if (b?.deleted_at != null) return false;
        if (String(m.status).toLowerCase() === 'cancelled') return false;
        if (String(b?.status ?? '').toLowerCase() === 'cancelled') return false;
        return true;
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
      const viewerPlayerId = playerProfile?.id ?? null;
      const mapped = mineRaw
        .map((m) => mapMatchToPartido(m, { viewerPlayerId }))
        .filter((p): p is PartidoItem => p != null)
        .filter((p) => !isPartidoCancelled(p));
      return enrichPartidosWithProfileAvatar(mapped, playerProfile);
    },
    [],
  );

  const upsertMisPartido = useCallback((item: PartidoItem) => {
    if (isPartidoCancelled(item)) {
      pendingLocalMisPartidoIdsRef.current.delete(item.id);
      setMisPartidos((prev) => removeMisPartidoFromList(prev, item.id));
      return;
    }
    pendingLocalMisPartidoIdsRef.current.set(item.id, Date.now());
    setMisPartidos((prev) => upsertMisPartidosList(prev, item));
  }, []);

  const removeMisPartido = useCallback((matchId: string) => {
    pendingLocalMisPartidoIdsRef.current.delete(matchId);
    setMisPartidos((prev) => removeMisPartidoFromList(prev, matchId));
  }, []);

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

  useEffect(() => {
    profileForEnrichRef.current = profileForEnrich;
  }, [profileForEnrich]);

  /** Si el perfil llega después de /matches/mine, rellena avatares sin esperar otro refetch. */
  useEffect(() => {
    if (!profileForEnrich?.id?.trim()) return;
    cachePlayerAvatar(profileForEnrich.id, profileForEnrich.avatarUrl);
    setMisPartidos((prev) => {
      if (prev.length === 0) return prev;
      const next = enrichPartidosWithProfileAvatar(prev, profileForEnrich);
      const same = next.every((p, i) => p === prev[i]);
      return same ? prev : next;
    });
  }, [
    profileForEnrich?.id,
    profileForEnrich?.avatarUrl,
    profileForEnrich?.firstName,
    profileForEnrich?.lastName,
    profileForEnrich?.username,
  ]);

  const refreshMatches = useCallback(
    async ({ force = false, scope = 'full' }: { force?: boolean; scope?: 'full' | 'mine' } = {}) => {
      if (!token) {
        setMisPartidos([]);
        setPartidos([]);
        matchesLoadedAt.current = 0;
        everSyncedMisPartidoIdsRef.current.clear();
        pendingLocalMisPartidoIdsRef.current.clear();
        return;
      }
      const mineOnly = scope === 'mine';
      if (!force && !mineOnly && matchesLoadedAt.current > 0) return;
      if (mineOnly && !force && matchesLoadedAt.current > 0) {
        const lastMineRefresh = refreshMatchesMineAt.current;
        if (Date.now() - lastMineRefresh < 3000) return;
      }

      const execute = async () => {
        const gen = ++refreshMatchesGen.current;
        const isFirst = matchesLoadedAt.current === 0;
        if (isFirst) setMatchesLoading(true);

        try {
          const playerId = profileForEnrichRef.current?.id ?? profile?.id ?? null;
          const enrichProfile = profileForEnrichRef.current;

          const myMatches = await fetchMyMatches(token, { phase: 'all', limit: 100 });
          if (gen !== refreshMatchesGen.current) return;

          const mineNormalized = (myMatches as MatchEnriched[]).map(normalizeMatchEnriched);
          for (const m of mineNormalized) {
            if (m.id) everSyncedMisPartidoIdsRef.current.add(m.id);
          }
          const misFromServer = buildMisPartidosFromMatches(mineNormalized, enrichProfile);
          const serverIds = new Set(misFromServer.map((p) => p.id));
          for (const id of serverIds) {
            pendingLocalMisPartidoIdsRef.current.delete(id);
          }

          const prevMis = misPartidosRef.current;
          const staleIds = await findMisPartidoIdsToRemove(prevMis, serverIds, token);
          for (const id of staleIds) {
            pendingLocalMisPartidoIdsRef.current.delete(id);
          }
          const prunedPrev = prevMis.filter((p) => !staleIds.has(p.id));

          setMisPartidos(
            mergeMisPartidosFromServer(
              prunedPrev,
              misFromServer,
              enrichProfile,
              everSyncedMisPartidoIdsRef.current,
              pendingLocalMisPartidoIdsRef.current,
            ),
          );

          if (!mineOnly) {
            const { dateFrom, dateTo } = defaultPartidosDiscoveryDateRange();
            const discoveryRows = await fetchMatches({
              expand: true,
              token,
              activeOnly: true,
              discovery: true,
              visibility: 'public',
              dateFrom,
              dateTo,
              joinableOnly: true,
              limit: 80,
            });
            if (gen !== refreshMatchesGen.current) return;
            const open = discoveryRows
              .map((m) => mapMatchToPartido(m, { viewerPlayerId: playerId }))
              .filter((p): p is PartidoItem => p != null)
              .filter((p) => p.matchPhase !== 'past')
              .filter((p) => isPartidoOpenForDiscovery(p, playerId));
            setPartidos(open);
          }

          matchesLoadedAt.current = Date.now();
          if (mineOnly) refreshMatchesMineAt.current = Date.now();
        } catch {
          if (isFirst) setHasInitialError(true);
        } finally {
          if (isFirst && gen === refreshMatchesGen.current) setMatchesLoading(false);
        }
      };

      if (!refreshMatchesInFlight.current) {
        const p = execute();
        refreshMatchesInFlight.current = p;
        void p.finally(() => {
          if (refreshMatchesInFlight.current === p) {
            refreshMatchesInFlight.current = null;
          }
        });
      }
      await refreshMatchesInFlight.current;
    },
    [token, buildMisPartidosFromMatches, profile?.id],
  );

  const refreshCourtReservations = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!token) {
        setMisReservasPista([]);
        courtReservationsLoadedAt.current = 0;
        return;
      }
      if (!force && courtReservationsLoadedAt.current > 0) return;
      const isFirst = courtReservationsLoadedAt.current === 0;
      if (isFirst) setCourtReservationsLoading(true);
      try {
        const res = await fetchMyCourtReservations(token, { phase: 'all', limit: 50 });
        if (res.ok) {
          setMisReservasPista(res.reservations);
          courtReservationsLoadedAt.current = Date.now();
        } else if (isFirst) {
          setHasInitialError(true);
        }
      } catch {
        if (isFirst) setHasInitialError(true);
      } finally {
        if (isFirst) setCourtReservationsLoading(false);
      }
    },
    [token],
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

      if (freshProfile) {
        setProfile((prev) => {
          if (
            prev?.id === freshProfile.id &&
            prev.avatarUrl === freshProfile.avatarUrl &&
            prev.firstName === freshProfile.firstName &&
            prev.lastName === freshProfile.lastName
          ) {
            return prev;
          }
          return freshProfile;
        });
        profileLoadedAt.current = Date.now();
      }
    },
    [token, profile?.id, profile?.firstName, profile?.lastName, profile?.avatarUrl, upsertMisPartido, removeMisPartido, refreshMatches],
  );

  const refreshTournaments = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force && tournamentsLoadedAt.current > 0) return;
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

  const refreshStats = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force && statsLoadedAt.current > 0) return;
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
      if (!force && streakLoadedAt.current > 0) return;
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
  // Logout: solo cuando userId desaparece (no en refresh de JWT).
  // -----------------------------------------------------------------
  useEffect(() => {
    if (userId) return;
    const prevUser = lastSessionUserIdRef.current;
    if (prevUser) {
      bootstrappedUserIds.delete(prevUser);
      lastBackgroundRefreshAtByUser.delete(prevUser);
    }
    lastSessionUserIdRef.current = null;
    refreshMatchesGen.current = 0;
    profileLoadedAt.current = 0;
    matchesLoadedAt.current = 0;
    courtReservationsLoadedAt.current = 0;
    tournamentsLoadedAt.current = 0;
    statsLoadedAt.current = 0;
    streakLoadedAt.current = 0;
    setHasInitialError(false);
    setProfile(null);
    setPartidos([]);
    setMisPartidos([]);
    setMisReservasPista([]);
    setPublicTournamentsCount(null);
    setStats(null);
    setStreak({ currentStreak: 0, longestStreak: 0, multiplier: 0, lastCompleted: null });
  }, [userId]);

  // -----------------------------------------------------------------
  // Bootstrap: una sola vez por userId cuando hay token.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!token || !userId) return;

    const switchedUser =
      lastSessionUserIdRef.current != null && lastSessionUserIdRef.current !== userId;
    if (switchedUser) {
      bootstrappedUserIds.delete(lastSessionUserIdRef.current!);
      profileLoadedAt.current = 0;
      matchesLoadedAt.current = 0;
      tournamentsLoadedAt.current = 0;
      statsLoadedAt.current = 0;
      streakLoadedAt.current = 0;
    }

    lastSessionUserIdRef.current = userId;
    if (bootstrappedUserIds.has(userId)) return;

    bootstrappedUserIds.add(userId);
    profileLoadedAt.current = 0;
    matchesLoadedAt.current = 0;
    courtReservationsLoadedAt.current = 0;
    tournamentsLoadedAt.current = 0;
    statsLoadedAt.current = 0;
    streakLoadedAt.current = 0;
    setHasInitialError(false);
    void refreshProfile({ force: true });
    void refreshMatches({ force: true });
    void refreshCourtReservations({ force: true });
    void refreshTournaments({ force: true });
    void refreshStats({ force: true });
    void refreshStreak({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const refreshFnsRef = useRef({
    refreshProfile,
    refreshMatches,
    refreshCourtReservations,
    refreshTournaments,
    refreshStats,
    refreshStreak,
  });
  refreshFnsRef.current = {
    refreshProfile,
    refreshMatches,
    refreshCourtReservations,
    refreshTournaments,
    refreshStats,
    refreshStreak,
  };

  // -----------------------------------------------------------------
  // Al volver del background: refresh con cooldown (30s por usuario).
  // -----------------------------------------------------------------
  useEffect(() => {
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const prev = last;
      last = next;
      const uid = lastSessionUserIdRef.current;
      if (prev.match(/inactive|background/) && next === 'active' && token && uid) {
        const lastAt = lastBackgroundRefreshAtByUser.get(uid) ?? 0;
        if (Date.now() - lastAt < BACKGROUND_REFRESH_COOLDOWN_MS) return;
        lastBackgroundRefreshAtByUser.set(uid, Date.now());
        const fns = refreshFnsRef.current;
        void fns.refreshProfile({ force: true });
        void fns.refreshMatches({ force: true });
        void fns.refreshCourtReservations({ force: true });
        void fns.refreshTournaments({ force: true });
        void fns.refreshStats({ force: true });
        void fns.refreshStreak({ force: true });
      }
    });
    return () => sub.remove();
  }, [token]);

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

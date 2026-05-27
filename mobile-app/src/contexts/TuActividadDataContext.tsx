import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchMyMatches } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyEnrollments, type CourseEnrollment } from '../api/schoolCourses';
import { fetchMyTournaments, type PublicTournamentRow } from '../api/tournaments';
import { useAuth } from './AuthContext';
import { useHomeData } from './HomeDataContext';
import type { PartidoItem } from '../screens/PartidosScreen';

const TOURNAMENTS_PAGE = 50;

type TuActividadDataValue = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  pastPartidos: PartidoItem[];
  enrollments: CourseEnrollment[];
  tournaments: PublicTournamentRow[];
  tournamentsHasMore: boolean;
  loadingMoreTournaments: boolean;
  counts: {
    pastPartidos: number;
    enrollments: number;
    tournaments: number;
    favoriteClubs: number;
  };
  refresh: () => Promise<void>;
  loadMoreTournaments: () => Promise<void>;
};

const TuActividadDataContext = createContext<TuActividadDataValue | null>(null);

export function TuActividadDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { profile, profileLoading } = useHomeData();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMoreTournaments, setLoadingMoreTournaments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastPartidos, setPastPartidos] = useState<PartidoItem[]>([]);
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [tournaments, setTournaments] = useState<PublicTournamentRow[]>([]);
  const [tournamentsHasMore, setTournamentsHasMore] = useState(false);

  const loadAll = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setPastPartidos([]);
      setEnrollments([]);
      setTournaments([]);
      setTournamentsHasMore(false);
      setError('Inicia sesión para ver tu actividad.');
      return;
    }
    setError(null);
    try {
      const [pastMatches, enrollRes, tourRes] = await Promise.all([
        fetchMyMatches(token, { phase: 'past', limit: 200 }),
        fetchMyEnrollments(token),
        fetchMyTournaments(token, { limit: TOURNAMENTS_PAGE, offset: 0 }),
      ]);

      setPastPartidos(
        pastMatches.map(mapMatchToPartido).filter((p): p is PartidoItem => p != null),
      );
      setEnrollments(enrollRes.ok && Array.isArray(enrollRes.enrollments) ? enrollRes.enrollments : []);
      if (tourRes.ok) {
        setTournaments(tourRes.tournaments);
        setTournamentsHasMore(tourRes.pagination.has_more);
      } else {
        setTournaments([]);
        setTournamentsHasMore(false);
        setError(tourRes.error);
      }
    } catch {
      setError('No se pudo cargar tu actividad.');
      setPastPartidos([]);
      setEnrollments([]);
      setTournaments([]);
      setTournamentsHasMore(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadAll();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const loadMoreTournaments = useCallback(async () => {
    const token = session?.access_token;
    if (!token || !tournamentsHasMore || loadingMoreTournaments) return;
    setLoadingMoreTournaments(true);
    try {
      const r = await fetchMyTournaments(token, { limit: TOURNAMENTS_PAGE, offset: tournaments.length });
      if (r.ok) {
        setTournaments((prev) => [...prev, ...r.tournaments]);
        setTournamentsHasMore(r.pagination.has_more);
      }
    } finally {
      setLoadingMoreTournaments(false);
    }
  }, [session?.access_token, tournamentsHasMore, loadingMoreTournaments, tournaments.length]);

  const counts = useMemo(
    () => ({
      pastPartidos: pastPartidos.length,
      enrollments: enrollments.length,
      tournaments: tournaments.length,
      favoriteClubs: profile?.preferences.favoriteClubs.length ?? 0,
    }),
    [profile, pastPartidos.length, enrollments.length, tournaments.length],
  );

  const value = useMemo(
    () => ({
      loading: loading || profileLoading,
      refreshing,
      error,
      pastPartidos,
      enrollments,
      tournaments,
      tournamentsHasMore,
      loadingMoreTournaments,
      counts,
      refresh,
      loadMoreTournaments,
    }),
    [
      loading,
      profileLoading,
      refreshing,
      error,
      pastPartidos,
      enrollments,
      tournaments,
      tournamentsHasMore,
      loadingMoreTournaments,
      counts,
      refresh,
      loadMoreTournaments,
    ],
  );

  return (
    <TuActividadDataContext.Provider value={value}>{children}</TuActividadDataContext.Provider>
  );
}

export function useTuActividadData() {
  const ctx = useContext(TuActividadDataContext);
  if (!ctx) throw new Error('useTuActividadData debe usarse dentro de TuActividadDataProvider');
  return ctx;
}

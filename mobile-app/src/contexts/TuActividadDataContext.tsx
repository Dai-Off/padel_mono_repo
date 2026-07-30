import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type CourseEnrollment } from '../api/schoolCourses';
import { type PublicTournamentRow } from '../api/tournaments';
import { useMyProfile } from '../queries/profile';
import {
  useFavoriteClubCountQuery,
  useMyEnrollmentsQuery,
  useMyTournamentsInfinite,
  usePastPartidosQuery,
} from '../queries/tuActividad';
import { tuActividadKeys } from '../queries/keys';
import { useAuth } from './AuthContext';
import type { PartidoItem } from '../screens/PartidosScreen';

/** Identidades estables para los estados vacíos (evitan re-renders por `?? []`). */
const EMPTY_PARTIDOS: PartidoItem[] = [];
const EMPTY_ENROLLMENTS: CourseEnrollment[] = [];
const EMPTY_TOURNAMENTS: PublicTournamentRow[] = [];

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

/**
 * Provider de "Tu actividad": ahora es una fachada sin estado propio sobre las
 * queries de React Query (queries/tuActividad.ts). La paginación de torneos usa
 * useInfiniteQuery; el resto son queries simples. La API pública no cambia.
 */
export function TuActividadDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const token = session?.access_token ?? null;
  const queryClient = useQueryClient();

  const profileQuery = useMyProfile();
  const pastQuery = usePastPartidosQuery();
  const enrollmentsQuery = useMyEnrollmentsQuery();
  const tournamentsQuery = useMyTournamentsInfinite();
  const favoriteClubsQuery = useFavoriteClubCountQuery();

  const pastPartidos = pastQuery.data ?? EMPTY_PARTIDOS;
  const enrollments = enrollmentsQuery.data ?? EMPTY_ENROLLMENTS;
  const tournaments = tournamentsQuery.data
    ? tournamentsQuery.data.pages.flatMap((p) => p.tournaments)
    : EMPTY_TOURNAMENTS;
  const favoriteClubCount = favoriteClubsQuery.data ?? 0;

  const loading =
    profileQuery.isLoading ||
    pastQuery.isLoading ||
    enrollmentsQuery.isLoading ||
    tournamentsQuery.isLoading;

  // Pull-to-refresh visual: cualquier revalidación con datos ya presentes.
  const refreshing =
    pastQuery.isRefetching || enrollmentsQuery.isRefetching || tournamentsQuery.isRefetching;

  // Sin sesión, mensaje del contexto viejo; con sesión, error genérico si algún
  // dataset falló en su primera carga (sin dato previo).
  const error = !token
    ? 'Inicia sesión para ver tu actividad.'
    : (pastQuery.isError && pastQuery.data == null) ||
        (enrollmentsQuery.isError && enrollmentsQuery.data == null) ||
        (tournamentsQuery.isError && tournamentsQuery.data == null)
      ? 'No se pudo cargar tu actividad.'
      : null;

  const refresh = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: tuActividadKeys.all(userId) });
  }, [queryClient, userId]);

  const loadMoreTournaments = useCallback(async () => {
    if (!tournamentsQuery.hasNextPage || tournamentsQuery.isFetchingNextPage) return;
    await tournamentsQuery.fetchNextPage();
  }, [tournamentsQuery]);

  const counts = useMemo(
    () => ({
      pastPartidos: pastPartidos.length,
      enrollments: enrollments.length,
      tournaments: tournaments.length,
      favoriteClubs: favoriteClubCount,
    }),
    [pastPartidos.length, enrollments.length, tournaments.length, favoriteClubCount],
  );

  const value = useMemo<TuActividadDataValue>(
    () => ({
      loading,
      refreshing,
      error,
      pastPartidos,
      enrollments,
      tournaments,
      tournamentsHasMore: Boolean(tournamentsQuery.hasNextPage),
      loadingMoreTournaments: tournamentsQuery.isFetchingNextPage,
      counts,
      refresh,
      loadMoreTournaments,
    }),
    [
      loading,
      refreshing,
      error,
      pastPartidos,
      enrollments,
      tournaments,
      tournamentsQuery.hasNextPage,
      tournamentsQuery.isFetchingNextPage,
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

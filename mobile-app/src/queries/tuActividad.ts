import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyMatches } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyEnrollments } from '../api/schoolCourses';
import { fetchMyTournaments } from '../api/tournaments';
import { countFavoriteClubsFromIds, resolveSavedFavoriteClubIds } from '../lib/favoriteClubIds';
import { useClubCatalog } from '../hooks/useClubCatalog';
import { useMyProfile } from './profile';
import { tuActividadKeys } from './keys';
import type { PartidoItem } from '../screens/PartidosScreen';

/**
 * Queries de "Tu actividad" (historial). Sustituyen al fetch manual del antiguo
 * TuActividadDataContext, que ahora es una fachada sobre estas queries. Datos
 * volátiles: la raíz 'tu-actividad' NO entra en PERSIST_ROOTS.
 */

export const TOURNAMENTS_PAGE = 50;

function useTuActividadSession() {
  const { session } = useAuth();
  return { token: session?.access_token, userId: session?.user?.id };
}

/**
 * Partidos pasados, ya mapeados a PartidoItem con la perspectiva del jugador.
 * La key incluye el viewerId: al llegar el perfil se remapea (paridad con el
 * contexto viejo, cuyo loadAll dependía de profile?.id).
 */
export function usePastPartidosQuery() {
  const { token, userId } = useTuActividadSession();
  const { data: profile } = useMyProfile();
  const viewerPlayerId = profile?.id ?? null;
  return useQuery({
    queryKey: tuActividadKeys.pastPartidos(userId ?? 'anon', viewerPlayerId ?? 'none'),
    queryFn: async () => {
      const pastMatches = await fetchMyMatches(token!, { phase: 'past', limit: 200 });
      return pastMatches
        .map((m) => mapMatchToPartido(m, { viewerPlayerId }))
        .filter((p): p is PartidoItem => p != null);
    },
    enabled: Boolean(token && userId),
  });
}

/** Inscripciones a cursos de escuela. Tolerante: en error devuelve lista vacía. */
export function useMyEnrollmentsQuery() {
  const { token, userId } = useTuActividadSession();
  return useQuery({
    queryKey: tuActividadKeys.enrollments(userId ?? 'anon'),
    queryFn: async () => {
      const r = await fetchMyEnrollments(token!);
      return r.ok && Array.isArray(r.enrollments) ? r.enrollments : [];
    },
    enabled: Boolean(token && userId),
  });
}

/** Torneos del jugador, paginados por offset (infinite query). */
export function useMyTournamentsInfinite() {
  const { token, userId } = useTuActividadSession();
  return useInfiniteQuery({
    queryKey: tuActividadKeys.tournaments(userId ?? 'anon'),
    queryFn: async ({ pageParam }) => {
      const r = await fetchMyTournaments(token!, { limit: TOURNAMENTS_PAGE, offset: pageParam });
      if (!r.ok) throw new Error(r.error || 'my-tournaments failed');
      return r;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.pagination.has_more) return undefined;
      // Offset = total de torneos ya cargados (paginación por desplazamiento).
      return allPages.reduce((sum, p) => sum + p.tournaments.length, 0);
    },
    enabled: Boolean(token && userId),
  });
}

/** Conteo de clubs favoritos resuelto contra el catálogo (lee de AsyncStorage). */
export function useFavoriteClubCountQuery() {
  const { userId } = useTuActividadSession();
  const { data: profile } = useMyProfile();
  const { clubs: clubCatalog } = useClubCatalog();
  return useQuery({
    queryKey: tuActividadKeys.favoriteClubs(userId ?? 'anon'),
    queryFn: async () => {
      const favoriteIds = await resolveSavedFavoriteClubIds(profile ?? null, clubCatalog);
      return countFavoriteClubsFromIds(favoriteIds);
    },
    enabled: Boolean(userId && profile),
  });
}

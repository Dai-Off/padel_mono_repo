import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchMatchmakingLeaderboard,
  fetchMatchmakingLeagueConfig,
  fetchMatchmakingStatus,
} from '../api/matchmaking';
import { fetchMatches } from '../api/matches';
import { fetchReceivedMatchInvites } from '../api/matchInvites';
import { matchmakingKeys } from './keys';

/** Tamaño de página del ranking (paridad con RANKING_PAGE_SIZE de la pantalla). */
const RANKING_PAGE_SIZE = 15;

/**
 * Polls de matchmaking en React Query (sustituyen a los dos setTimeout
 * recursivos del MatchmakingContext). Solo el FETCH vive aquí; la máquina de
 * banner/timeout es estado de cliente y se queda en el contexto.
 *
 * Datos volátiles: la raíz 'matchmaking' NO entra en PERSIST_ROOTS. El polling
 * se pausa en background (refetchIntervalInBackground: false) igual que los
 * timeouts originales, que se limpiaban al desmontar.
 */

function useMatchmakingSession() {
  const { session } = useAuth();
  return { token: session?.access_token, userId: session?.user?.id };
}

/** Estado de cola + invitaciones de pareja embebidas. Poll cada 5 s. */
export function useMatchmakingStatusQuery() {
  const { token, userId } = useMatchmakingSession();
  return useQuery({
    queryKey: matchmakingKeys.status(userId ?? 'anon'),
    queryFn: async () => (await fetchMatchmakingStatus(token!)) ?? null,
    enabled: Boolean(token && userId),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/** Invitaciones a partidos recibidas. Poll cada 8 s. */
export function useReceivedMatchInvitesQuery() {
  const { token, userId } = useMatchmakingSession();
  return useQuery({
    queryKey: matchmakingKeys.receivedInvites(userId ?? 'anon'),
    queryFn: async () => {
      const res = await fetchReceivedMatchInvites(token!);
      if (!res.ok) throw new Error('received-invites failed');
      return res.invites;
    },
    enabled: Boolean(token && userId),
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/**
 * Config de divisiones de la liga. Pública y casi estática: staleTime alto y
 * caché en memoria (evita re-fetch al reabrir la pantalla de liga).
 */
export function useMatchmakingLeagueConfigQuery() {
  return useQuery({
    queryKey: matchmakingKeys.leagueConfig(),
    queryFn: async () => (await fetchMatchmakingLeagueConfig()) ?? [],
    staleTime: 60 * 60 * 1000,
  });
}

/** Ranking de la liga (paginado por offset). Cachea entre aperturas por liga. */
export function useMatchmakingLeaderboardInfinite(liga: string | null | undefined) {
  const { token, userId } = useMatchmakingSession();
  return useInfiniteQuery({
    queryKey: matchmakingKeys.leaderboard(userId ?? 'anon', liga ?? 'none'),
    queryFn: async ({ pageParam }) => {
      const r = await fetchMatchmakingLeaderboard(token, {
        liga,
        limit: RANKING_PAGE_SIZE,
        offset: pageParam,
      });
      if (!r) throw new Error('leaderboard failed');
      return r;
    },
    initialPageParam: 0,
    getNextPageParam: (last, all) =>
      last?.has_more ? all.reduce((sum, p) => sum + (p?.rows.length ?? 0), 0) : undefined,
    enabled: Boolean(token && userId && liga),
  });
}

/**
 * Partidos de matchmaking recientes del jugador. Devuelve los MatchEnriched
 * crudos; la pantalla aplica su mapeo `toRecentRows`. Cachea entre aperturas.
 */
export function useRecentMatchmakingMatchesQuery(viewerId: string | null | undefined) {
  const { token, userId } = useMatchmakingSession();
  return useQuery({
    queryKey: matchmakingKeys.recent(userId ?? 'anon', viewerId ?? 'none'),
    queryFn: () => fetchMatches({ expand: true, token: token!, activeOnly: false }),
    enabled: Boolean(token && userId && viewerId),
  });
}

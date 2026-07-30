import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchMatchmakingStatus } from '../api/matchmaking';
import { fetchReceivedMatchInvites } from '../api/matchInvites';
import { matchmakingKeys } from './keys';

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

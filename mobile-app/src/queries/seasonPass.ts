import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { CLUB_IANA_TIMEZONE } from '../lib/clubTimeZone';
import {
  ackSeasonPassMissions,
  claimAllSeasonPassRewards,
  claimSeasonPassReward,
  fetchSeasonPassEstado,
  fetchSeasonPassMisiones,
  rerollSeasonPassMission,
  type SeasonPassEstadoOk,
  type SeasonPassMisionesOk,
} from '../api/seasonPass';
import { seasonPassKeys } from './keys';

function useSeasonPassSession() {
  const { session } = useAuth();
  return { token: session?.access_token, userId: session?.user?.id };
}

/**
 * GET /season-pass/estado — hero + track + boosts (rápido, sin evaluación de
 * misiones). Es lo único que bloquea el primer pintado del pase y lo que
 * consume la card del Home. En la whitelist de persistencia → warm start.
 */
export function useSeasonPassEstado() {
  const { token, userId } = useSeasonPassSession();
  return useQuery({
    queryKey: seasonPassKeys.estado(userId ?? 'anon'),
    queryFn: async () => {
      // La API devuelve null en error (no lanza): lo convertimos en throw
      // para que isError y retry funcionen.
      const data = await fetchSeasonPassEstado(token!, CLUB_IANA_TIMEZONE);
      if (!data) throw new Error('season-pass/estado failed');
      return data;
    },
    enabled: Boolean(token && userId),
  });
}

/**
 * GET /season-pass/misiones — la evaluación lenta. Llega por su cuenta y la
 * sección de misiones se rellena cuando está (patrón del perfil: cada sección
 * con su skeleton). Si la evaluación otorgó SP, el sp devuelto difiere del
 * /estado cacheado y lo invalidamos para que el hero se reconcilie.
 */
export function useSeasonPassMisiones() {
  const { token, userId } = useSeasonPassSession();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: seasonPassKeys.misiones(userId ?? 'anon'),
    queryFn: async () => {
      const data = await fetchSeasonPassMisiones(token!, CLUB_IANA_TIMEZONE);
      if (!data) throw new Error('season-pass/misiones failed');
      if (userId) {
        const estado = queryClient.getQueryData<SeasonPassEstadoOk>(
          seasonPassKeys.estado(userId),
        );
        if (estado && estado.sp !== data.sp) {
          void queryClient.invalidateQueries({ queryKey: seasonPassKeys.estado(userId) });
        }
      }
      return data;
    },
    enabled: Boolean(token && userId),
  });
}

/** Marca como claimed en el caché los rewards indicados y ajusta el contador. */
function applyClaimedToEstado(
  estado: SeasonPassEstadoOk,
  claimedIds: ReadonlySet<string>,
): SeasonPassEstadoOk {
  let transitioned = 0;
  const track = estado.track_rewards?.map((lvl) => ({
    ...lvl,
    rewards: lvl.rewards.map((r) => {
      if (!claimedIds.has(r.id) || r.status !== 'claimable') return r;
      transitioned += 1;
      return { ...r, status: 'claimed' as const };
    }),
  }));
  return {
    ...estado,
    track_rewards: track,
    claimable_count: Math.max(0, (estado.claimable_count ?? 0) - transitioned),
  };
}

/**
 * Claim de un reward del track. Actualiza el caché de /estado al momento
 * (claimed + contador) y lo invalida en background para reconciliar sp/level
 * sin bloquear la celebración. No toca /misiones: un claim no cambia misiones
 * y re-dispararía la evaluación lenta gratis.
 */
export function useClaimReward() {
  const { token, userId } = useSeasonPassSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rewardId: string) => {
      if (!token) throw new Error('no session');
      const res = await claimSeasonPassReward(token, rewardId);
      if (!res.ok) throw new Error(res.error ?? 'claim failed');
      return res;
    },
    onSuccess: (_res, rewardId) => {
      if (!userId) return;
      queryClient.setQueryData<SeasonPassEstadoOk>(seasonPassKeys.estado(userId), (prev) =>
        prev ? applyClaimedToEstado(prev, new Set([rewardId])) : prev,
      );
      void queryClient.invalidateQueries({ queryKey: seasonPassKeys.estado(userId) });
    },
  });
}

/** Claim de todos los reclamables. La respuesta (rewards) alimenta el grid de celebración. */
export function useClaimAllRewards() {
  const { token, userId } = useSeasonPassSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('no session');
      const res = await claimAllSeasonPassRewards(token);
      if (!res.ok) throw new Error(res.error ?? 'claim-all failed');
      return res;
    },
    onSuccess: (res) => {
      if (!userId) return;
      queryClient.setQueryData<SeasonPassEstadoOk>(seasonPassKeys.estado(userId), (prev) =>
        prev ? applyClaimedToEstado(prev, new Set(res.rewards.map((r) => r.reward_id))) : prev,
      );
      void queryClient.invalidateQueries({ queryKey: seasonPassKeys.estado(userId) });
    },
  });
}

/**
 * Reroll de una misión. Sin efectos sobre el caché: la misión nueva solo llega
 * por refetch de /misiones y el llamador decide cuándo esperarlo (la pantalla
 * cierra su modal tras el POST y mantiene los botones deshabilitados hasta
 * que el refetch trae la misión nueva).
 */
export function useRerollMission() {
  const { token } = useSeasonPassSession();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      if (!token) throw new Error('no session');
      const res = await rerollSeasonPassMission(token, assignmentId, CLUB_IANA_TIMEZONE);
      if (!res.ok) throw new Error(res.error ?? 'reroll failed');
    },
  });
}

/**
 * Ack de celebraciones diferidas, optimista: salen del caché de /misiones al
 * instante y el POST va detrás. Sin rollback deliberadamente: si falla, el
 * backend las re-entrega en el siguiente /misiones y se vuelven a mostrar.
 */
export function useAckCelebrations() {
  const { token, userId } = useSeasonPassSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentIds: string[]) => {
      if (!token) return false;
      return ackSeasonPassMissions(token, assignmentIds);
    },
    onMutate: async (assignmentIds) => {
      if (!userId) return;
      // Cancela un /misiones en vuelo: su respuesta (anterior al ack) podría
      // resucitar las celebraciones recién cerradas.
      await queryClient.cancelQueries({ queryKey: seasonPassKeys.misiones(userId) });
      queryClient.setQueryData<SeasonPassMisionesOk>(
        seasonPassKeys.misiones(userId),
        (prev) => {
          if (!prev?.pending_celebrations?.length) return prev;
          return {
            ...prev,
            pending_celebrations: prev.pending_celebrations.filter(
              (c) => !assignmentIds.includes(c.assignment_id),
            ),
          };
        },
      );
    },
  });
}

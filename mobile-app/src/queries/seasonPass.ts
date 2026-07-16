import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { CLUB_IANA_TIMEZONE } from '../lib/clubTimeZone';
import {
  ackSeasonPassMissions,
  claimAllSeasonPassRewards,
  claimSeasonPassReward,
  fetchSeasonPassMe,
  rerollSeasonPassMission,
  type SeasonPassMeOk,
} from '../api/seasonPass';
import { seasonPassKeys } from './keys';

function useSeasonPassSession() {
  const { session } = useAuth();
  return { token: session?.access_token, userId: session?.user?.id };
}

/**
 * GET /season-pass/me compartido (pantalla del pase, card del Home y host de
 * celebraciones observan la misma query). Con la persistencia en AsyncStorage
 * el warm start pinta el caché al instante y reconcilia en background — clave
 * porque el /me en frío tarda varios segundos por la evaluación de misiones.
 */
export function useSeasonPassMe() {
  const { token, userId } = useSeasonPassSession();
  return useQuery({
    queryKey: seasonPassKeys.me(userId ?? 'anon'),
    queryFn: async () => {
      // La API devuelve null en error (no lanza): lo convertimos en throw
      // para que isError y retry funcionen.
      const data = await fetchSeasonPassMe(token!, CLUB_IANA_TIMEZONE);
      if (!data) throw new Error('season-pass/me failed');
      return data;
    },
    enabled: Boolean(token && userId),
  });
}

/** Marca como claimed en el caché los rewards indicados y ajusta el contador. */
function applyClaimedToMe(me: SeasonPassMeOk, claimedIds: ReadonlySet<string>): SeasonPassMeOk {
  let transitioned = 0;
  const track = me.track_rewards?.map((lvl) => ({
    ...lvl,
    rewards: lvl.rewards.map((r) => {
      if (!claimedIds.has(r.id) || r.status !== 'claimable') return r;
      transitioned += 1;
      return { ...r, status: 'claimed' as const };
    }),
  }));
  return {
    ...me,
    track_rewards: track,
    claimable_count: Math.max(0, (me.claimable_count ?? 0) - transitioned),
  };
}

/**
 * Claim de un reward del track. Actualiza el caché al momento (claimed +
 * contador) y reconcilia sp/level con un invalidate en background sin
 * bloquear la celebración (paridad con el antiguo `load()` no esperado).
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
      queryClient.setQueryData<SeasonPassMeOk>(seasonPassKeys.me(userId), (prev) =>
        prev ? applyClaimedToMe(prev, new Set([rewardId])) : prev,
      );
      void queryClient.invalidateQueries({ queryKey: seasonPassKeys.all(userId) });
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
      queryClient.setQueryData<SeasonPassMeOk>(seasonPassKeys.me(userId), (prev) =>
        prev ? applyClaimedToMe(prev, new Set(res.rewards.map((r) => r.reward_id))) : prev,
      );
      void queryClient.invalidateQueries({ queryKey: seasonPassKeys.all(userId) });
    },
  });
}

/**
 * Reroll de una misión. Sin efectos sobre el caché: la misión nueva solo llega
 * por refetch y el llamador decide cuándo esperarlo (la pantalla cierra su
 * modal tras el POST y mantiene los botones deshabilitados hasta el refetch).
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
 * Ack de celebraciones diferidas, optimista: salen del caché al instante y el
 * POST va detrás. Sin rollback deliberadamente: si falla, el backend las
 * re-entrega en el siguiente /me y se vuelven a mostrar.
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
      // Cancela un /me en vuelo: su respuesta (anterior al ack) podría
      // resucitar las celebraciones recién cerradas.
      await queryClient.cancelQueries({ queryKey: seasonPassKeys.me(userId) });
      queryClient.setQueryData<SeasonPassMeOk>(seasonPassKeys.me(userId), (prev) => {
        if (!prev?.pending_celebrations?.length) return prev;
        return {
          ...prev,
          pending_celebrations: prev.pending_celebrations.filter(
            (c) => !assignmentIds.includes(c.assignment_id),
          ),
        };
      });
    },
  });
}

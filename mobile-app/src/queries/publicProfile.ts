import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchPublicPlayerProfile, type PublicPlayerProfile } from '../api/players';
import {
  fetchPlayerLevelHistory,
  fetchPlayerStats,
  type LevelHistoryLimit,
} from '../api/profileStats';
import { fetchPlayerPublicCustomization } from '../api/profileCustomization';
import { fetchFrequentClubs, fetchFrequentPartners } from '../api/profileSocial';
import { toggleFollow } from '../api/playerFollows';
import { publicProfileKeys } from './keys';

/**
 * Queries del perfil público de otro jugador (sustituyen a los 5 effects con
 * flag `cancelled` de PublicProfileScreen). Datos volátiles: la raíz
 * 'public-profile' NO entra en PERSIST_ROOTS.
 *
 * Los datos null son legítimos (jugador sin stats, sin customización, no
 * encontrado): NO se convierten en throw; la pantalla degrada con su guard.
 */

function useViewerToken() {
  const { session } = useAuth();
  return session?.access_token ?? null;
}

/** Perfil base público: identidad, ELO, coach, isFollowing/followersCount. */
export function usePublicPlayerProfile(playerId: string) {
  const token = useViewerToken();
  return useQuery({
    queryKey: publicProfileKeys.base(playerId),
    queryFn: () => fetchPublicPlayerProfile(playerId, token),
    enabled: Boolean(playerId),
  });
}

/** Personalización pública (marco, título, tema). */
export function usePublicCustomization(playerId: string) {
  return useQuery({
    queryKey: publicProfileKeys.customization(playerId),
    queryFn: () => fetchPlayerPublicCustomization(playerId),
    enabled: Boolean(playerId),
  });
}

/** Estadísticas agregadas. `null` = sin datos (no bloquea nada). */
export function usePublicPlayerStats(playerId: string) {
  const token = useViewerToken();
  return useQuery({
    queryKey: publicProfileKeys.stats(playerId),
    queryFn: () => fetchPlayerStats(token, playerId),
    enabled: Boolean(playerId),
  });
}

/** Evolución del nivel. Al cambiar el límite se conserva el dataset previo. */
export function usePublicLevelHistory(playerId: string, limit: LevelHistoryLimit) {
  return useQuery({
    queryKey: publicProfileKeys.level(playerId, limit),
    queryFn: () => fetchPlayerLevelHistory(playerId, limit),
    enabled: Boolean(playerId),
    placeholderData: keepPreviousData,
  });
}

/** Clubs y compañeros frecuentes en una sola query (comparten card y loading). */
export function usePublicSocial(playerId: string) {
  return useQuery({
    queryKey: publicProfileKeys.social(playerId),
    queryFn: async () => {
      const [clubs, partners] = await Promise.all([
        fetchFrequentClubs(playerId),
        fetchFrequentPartners(playerId),
      ]);
      return { clubs, partners };
    },
    enabled: Boolean(playerId),
  });
}

/**
 * Seguir/dejar de seguir con update optimista sobre el caché del perfil base
 * (isFollowing + followersCount) y rollback en error. Sustituye al set/rollback
 * manual del onPress.
 */
export function useToggleFollowMutation(playerId: string) {
  const token = useViewerToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('follow: no token');
      const res = await toggleFollow(token, playerId);
      if (!res.ok) throw new Error('toggle-follow failed');
      return res;
    },
    onMutate: async () => {
      const key = publicProfileKeys.base(playerId);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<PublicPlayerProfile | null>(key);
      if (prev) {
        const prevCount = prev.followersCount ?? 0;
        queryClient.setQueryData<PublicPlayerProfile>(key, {
          ...prev,
          isFollowing: !prev.isFollowing,
          followersCount: prev.isFollowing ? prevCount - 1 : prevCount + 1,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(publicProfileKeys.base(playerId), ctx.prev);
      }
    },
  });
}

/**
 * Aplica en el caché del perfil base el cambio de follow originado en el modal
 * de seguidores (sincroniza followersCount/isFollowing del perfil visible).
 */
export function useSyncPublicProfileFollow(playerId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (isFollowingNow: boolean) => {
      const key = publicProfileKeys.base(playerId);
      queryClient.setQueryData<PublicPlayerProfile | null>(key, (prev) => {
        if (!prev) return prev;
        const prevCount = prev.followersCount ?? 0;
        return {
          ...prev,
          isFollowing: isFollowingNow,
          followersCount: isFollowingNow ? prevCount + 1 : Math.max(0, prevCount - 1),
        };
      });
    },
    [queryClient, playerId],
  );
}

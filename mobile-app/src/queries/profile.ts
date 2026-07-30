import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { fetchMyPlayerProfile } from '../api/players';
import { cachePlayerAvatar } from '../lib/partidoPlayerUtils';
import { fetchProfileBundle, type ProfileBundle } from '../api/profileBundle';
import { fetchMyCoachAssessment, fetchMyCoachStats } from '../api/coachAssessment';
import { fetchMyPeerFeedbackInsight } from '../api/peerFeedbackInsight';
import { fetchLevelHistory, fetchPlayerStats, type LevelHistoryLimit } from '../api/profileStats';
import { fetchFrequentClubs, fetchFrequentPartners } from '../api/profileSocial';
import type { ProfileCustomization } from '../api/profileCustomization';
import { profileKeys } from './keys';

/**
 * Queries del perfil propio (sustituyen al antiguo ProfileDataContext).
 *
 * - Una query por dataset; se montan al abrir la pantalla (sin bootstrap manual).
 * - staleTime 30s (global) = el viejo REVALIDATE_TTL_MS: reentradas < 30s sirven
 *   caché sin red; > 30s revalidan en silencio con los datos ya pintados.
 * - La vuelta de background la cubre el focusManager global (client.ts).
 * - 'profile' está en PERSIST_ROOTS: warm start desde disco en arranque frío.
 */

/**
 * Perfil base (MyPlayerProfile). No depende de HomeDataContext: es la fuente de
 * verdad también para el provider del Home (que la expone como fachada mientras
 * migran sus consumidores).
 */
export function useMyProfile() {
  const { session } = useAuth();
  const token = session?.access_token;
  const userId = session?.user?.id;
  return useQuery({
    queryKey: profileKeys.base(userId ?? 'anon'),
    queryFn: async () => {
      const p = await fetchMyPlayerProfile(token!);
      if (!p) throw new Error('my-profile failed');
      // El caché de avatares alimenta el enriquecido de las cards de partido.
      if (p.id) cachePlayerAvatar(p.id, p.avatarUrl);
      return p;
    },
    enabled: Boolean(token && userId),
  });
}

function useProfileSession() {
  const { session } = useAuth();
  const { data: myProfile } = useMyProfile();
  return {
    token: session?.access_token,
    userId: session?.user?.id,
    playerId: myProfile?.id,
  };
}

/** Bundle del HERO (personalización + marcos + logros): lo único que gatea el hero. */
export function useProfileBundle() {
  const { token, userId } = useProfileSession();
  return useQuery({
    queryKey: profileKeys.bundle(userId ?? 'anon'),
    queryFn: async () => {
      const b = await fetchProfileBundle(token!);
      if (!b) throw new Error('profile-bundle failed');
      return b;
    },
    enabled: Boolean(token && userId),
  });
}

/**
 * Radar del Coach. `null` es un dato legítimo (jugador sin assessment), por eso
 * NO se convierte en throw; el error de red también llega como null y la card
 * ofrece reintentar (reloadCoach).
 */
export function useCoachRadar() {
  const { token, userId } = useProfileSession();
  const { locale } = useTranslation();
  return useQuery({
    queryKey: profileKeys.radar(userId ?? 'anon', locale),
    queryFn: () => fetchMyCoachAssessment(token!, locale),
    enabled: Boolean(token && userId),
  });
}

/** Stats del Coach (contadores en vivo): rellenan la card sin bloquear el radar. */
export function useCoachStats() {
  const { token, userId } = useProfileSession();
  return useQuery({
    queryKey: profileKeys.coachStats(userId ?? 'anon'),
    queryFn: () => fetchMyCoachStats(token!),
    enabled: Boolean(token && userId),
  });
}

/** Insight del feedback de compañeros. `null` = sin datos o error (no bloquea nada). */
export function usePeerInsight() {
  const { token, userId, playerId } = useProfileSession();
  const { locale } = useTranslation();
  return useQuery({
    queryKey: profileKeys.peer(userId ?? 'anon', locale),
    queryFn: () => fetchMyPeerFeedbackInsight(token!, playerId!, locale),
    enabled: Boolean(token && userId && playerId),
  });
}

export function useLevelHistory(limit: LevelHistoryLimit) {
  const { token, userId } = useProfileSession();
  return useQuery({
    queryKey: profileKeys.level(userId ?? 'anon', limit),
    queryFn: async () => {
      const h = await fetchLevelHistory(token!, limit);
      if (!h) throw new Error('level-history failed');
      return h;
    },
    enabled: Boolean(token && userId),
    // Al cambiar el límite se sigue mostrando el dataset anterior mientras
    // llega el nuevo (paridad con el contexto antiguo: sin spinner).
    placeholderData: keepPreviousData,
  });
}

export function usePlayerStats() {
  const { token, userId, playerId } = useProfileSession();
  return useQuery({
    queryKey: profileKeys.stats(userId ?? 'anon'),
    queryFn: async () => {
      const s = await fetchPlayerStats(token!, playerId!);
      if (!s) throw new Error('player-stats failed');
      return s;
    },
    enabled: Boolean(token && userId && playerId),
  });
}

/** Clubs y compañeros frecuentes en una sola query (comparten card y loading). */
export function useProfileSocial() {
  const { userId, playerId } = useProfileSession();
  return useQuery({
    queryKey: profileKeys.social(userId ?? 'anon'),
    queryFn: async () => {
      const [clubs, partners] = await Promise.all([
        fetchFrequentClubs(playerId!),
        fetchFrequentPartners(playerId!),
      ]);
      return { clubs, partners };
    },
    enabled: Boolean(userId && playerId),
  });
}

/**
 * Acciones sobre el caché del perfil:
 * - refresh: invalida todo el dominio (tras onboarding / editar perfil).
 * - reloadCoach: re-fetch de radar + stats + peer (botón reintentar).
 * - setCustomization: actualización en caliente tras el modal de personalizar.
 */
export function useProfileDataActions() {
  const { userId } = useProfileSession();
  const { locale } = useTranslation();
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: profileKeys.all(userId) });
  }, [queryClient, userId]);

  const reloadCoach = useCallback(() => {
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: profileKeys.radar(userId, locale) });
    void queryClient.invalidateQueries({ queryKey: profileKeys.coachStats(userId) });
    void queryClient.invalidateQueries({ queryKey: profileKeys.peer(userId, locale) });
  }, [queryClient, userId, locale]);

  const setCustomization = useCallback(
    (c: ProfileCustomization) => {
      if (!userId) return;
      queryClient.setQueryData<ProfileBundle>(profileKeys.bundle(userId), (prev) =>
        prev ? { ...prev, customization: c } : prev,
      );
    },
    [queryClient, userId],
  );

  return { refresh, reloadCoach, setCustomization };
}

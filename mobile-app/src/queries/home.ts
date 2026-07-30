import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchHomeStats, type HomeStats } from '../api/home';
import { fetchPublicTournaments } from '../api/tournaments';
import { fetchMyCourtReservations } from '../api/bookings';
import { fetchStreak, type StreakInfo } from '../api/dailyLessons';
import { CLUB_IANA_TIMEZONE } from '../lib/clubTimeZone';
import { useRefreshMatches } from './matches';
import { homeKeys, profileKeys } from './keys';

/**
 * Queries del dashboard del Home (stats de quick actions + racha diaria).
 * Datos volátiles: la raíz 'home' NO entra en PERSIST_ROOTS a propósito.
 */

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  multiplier: number;
  lastCompleted: string | null;
};

export const DEFAULT_STREAK: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  multiplier: 0,
  lastCompleted: null,
};

const STATS_FALLBACK: HomeStats = {
  courtsFree: 0,
  playersLooking: 0,
  classesToday: 0,
  tournaments: 0,
};

function useHomeSession() {
  const { session } = useAuth();
  return { token: session?.access_token, userId: session?.user?.id };
}

/** Contadores de quick actions. En error devuelve ceros (nunca marca error). */
export function useHomeStats() {
  const { token, userId } = useHomeSession();
  return useQuery({
    queryKey: homeKeys.stats(userId ?? 'anon'),
    queryFn: () => fetchHomeStats(token!).catch(() => STATS_FALLBACK),
    enabled: Boolean(token && userId),
  });
}

/** Count de torneos públicos (lo único que usa el Home). */
export function usePublicTournamentsCount() {
  const { token, userId } = useHomeSession();
  return useQuery({
    queryKey: homeKeys.tournamentsCount(userId ?? 'anon'),
    queryFn: async () => {
      const r = await fetchPublicTournaments(token!);
      if (!r.ok) throw new Error('public-tournaments failed');
      return r.tournaments.length;
    },
    enabled: Boolean(token && userId),
  });
}

/** Reservas de pista privada del jugador (standard, flujo aparte de partidos). */
export function useMyCourtReservations() {
  const { token, userId } = useHomeSession();
  return useQuery({
    queryKey: homeKeys.courtReservations(userId ?? 'anon'),
    queryFn: async () => {
      const res = await fetchMyCourtReservations(token!, { phase: 'all', limit: 50 });
      if (!res.ok) throw new Error('court-reservations failed');
      return res.reservations;
    },
    enabled: Boolean(token && userId),
  });
}

/** Racha de la lección diaria. En error lanza y RQ conserva el dato previo (silencioso). */
export function useDailyStreak() {
  const { token, userId } = useHomeSession();
  return useQuery({
    queryKey: homeKeys.streak(userId ?? 'anon'),
    queryFn: async (): Promise<StreakState> => {
      const res = await fetchStreak(token!, CLUB_IANA_TIMEZONE);
      if ('ok' in res && res.ok === false) throw new Error('streak failed');
      const data = res as StreakInfo;
      return {
        currentStreak: data.current_streak,
        longestStreak: data.longest_streak,
        multiplier: data.multiplier,
        lastCompleted: data.last_lesson_completed_at,
      };
    },
    enabled: Boolean(token && userId),
  });
}

/**
 * Acciones de refresco del Home (antes fachada de HomeDataContext). Cada una
 * invalida su dominio con `force`; sin force son no-op salvo refreshMatches
 * scope 'mine' (throttle). refreshAll fuerza todo (CTA del banner de error /
 * pull-to-refresh).
 */
export function useHomeActions() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const queryClient = useQueryClient();
  const refreshMatches = useRefreshMatches();

  const refreshProfile = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: profileKeys.base(userId) });
    },
    [queryClient, userId],
  );

  const refreshCourtReservations = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: homeKeys.courtReservations(userId) });
    },
    [queryClient, userId],
  );

  const refreshTournaments = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: homeKeys.tournamentsCount(userId) });
    },
    [queryClient, userId],
  );

  const refreshStats = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: homeKeys.stats(userId) });
    },
    [queryClient, userId],
  );

  const refreshStreak = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force || !userId) return;
      await queryClient.invalidateQueries({ queryKey: homeKeys.streak(userId) });
    },
    [queryClient, userId],
  );

  const refreshAll = useCallback(async () => {
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

  return {
    refreshProfile,
    refreshMatches,
    refreshCourtReservations,
    refreshTournaments,
    refreshStats,
    refreshStreak,
    refreshAll,
  };
}

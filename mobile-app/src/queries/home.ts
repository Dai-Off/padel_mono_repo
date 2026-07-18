import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchHomeStats, type HomeStats } from '../api/home';
import { fetchStreak, type StreakInfo } from '../api/dailyLessons';
import { CLUB_IANA_TIMEZONE } from '../lib/clubTimeZone';
import { homeKeys } from './keys';

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

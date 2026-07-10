import { useHomeData } from '../contexts/HomeDataContext';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';

/**
 * Puente global: conecta eventos realtime → refrescos de HomeDataContext.
 * Montar una sola vez dentro de HomeDataProvider.
 */
export function AppRealtimeBridge() {
  const {
    profile,
    refreshMatches,
    refreshCourtReservations,
    refreshTournaments,
    refreshSeasonPass,
    refreshStats,
    refreshStreak,
    refreshProfile,
  } = useHomeData();

  const playerId = profile?.id ?? null;

  useRealtimeInvalidation(
    ['bookings'],
    () => {
      void refreshCourtReservations({ force: true });
    },
    { playerId },
  );

  useRealtimeInvalidation(
    ['matches', 'match_players'],
    () => {
      void refreshMatches({ force: true });
    },
    { playerId },
  );

  useRealtimeInvalidation(
    ['tournaments'],
    () => {
      void refreshTournaments({ force: true });
    },
    { playerId },
  );

  useRealtimeInvalidation(
    ['unlockables'],
    () => {
      void refreshProfile({ force: true });
    },
    {
      playerId,
      filter: (event, ctx) => {
        if (!ctx.playerId) return true;
        const row = event.payload.new ?? event.payload.old;
        if (!row || event.source === 'fallback') return true;
        return String(row.player_id ?? '') === ctx.playerId;
      },
    },
  );

  useRealtimeInvalidation(
    ['matchmaking', 'matchmaking_pair_invites', 'match_invites'],
    () => {
      void refreshMatches({ force: true, scope: 'mine' });
    },
    { playerId },
  );

  // Stats / streak: cambios indirectos tras partidos o lecciones.
  useRealtimeInvalidation(
    ['matches', 'match_players'],
    () => {
      void refreshStats({ force: true });
      void refreshStreak({ force: true });
      void refreshSeasonPass({ force: true });
    },
    { playerId, debounceMs: 800 },
  );

  return null;
}

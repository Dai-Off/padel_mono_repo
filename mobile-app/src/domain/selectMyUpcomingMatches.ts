import type { MatchEnriched } from '../api/matches';
import { getMatchListPhase } from './matchLifecycle';

/** Partidos donde participa el jugador y aún no terminaron (próximos o en curso). */
export function selectMyUpcomingMatches(
  matches: MatchEnriched[],
  playerId: string | null
): MatchEnriched[] {
  if (!playerId) return [];
  const now = Date.now();
  return [...matches]
    .filter((m) => {
      const inMatch = (m.match_players ?? []).some((mp) => mp.players?.id === playerId);
      if (!inMatch) return false;
      const b = m.bookings;
      if (!b?.start_at || !b?.end_at) return false;
      return getMatchListPhase(now, m.status, b.start_at, b.end_at) !== 'past';
    })
    .sort(
      (a, b) =>
        new Date(a.bookings!.start_at).getTime() - new Date(b.bookings!.start_at).getTime()
    );
}

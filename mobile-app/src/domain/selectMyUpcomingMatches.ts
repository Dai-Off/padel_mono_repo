import type { MatchEnriched } from '../api/matches';
import { getMatchListPhase } from './matchLifecycle';

/** Partidos donde participa el jugador y aún no terminaron (próximos o en curso). */
export function selectMyUpcomingMatches(
  matches: MatchEnriched[],
  playerId: string | null
): MatchEnriched[] {
  return selectMyMatchesForHomeInternal(matches, playerId, { includePast: false });
}

/**
 * Partidos donde participa el jugador que mostramos en el Home:
 * - Próximos / En curso
 * - Terminados (matchPhase === 'past')
 */
export function selectMyMatchesForHome(
  matches: MatchEnriched[],
  playerId: string | null
): MatchEnriched[] {
  return selectMyMatchesForHomeInternal(matches, playerId, { includePast: true });
}

function selectMyMatchesForHomeInternal(
  matches: MatchEnriched[],
  playerId: string | null,
  opts: { includePast: boolean }
): MatchEnriched[] {
  if (!playerId) return [];
  const now = Date.now();

  const mapped = matches
    .map((m) => {
      const inMatch = (m.match_players ?? []).some((mp) => mp.players?.id === playerId);
      if (!inMatch) return null;

      const rawBookings = m.bookings;
      const b = Array.isArray(rawBookings) ? rawBookings[0] : rawBookings;
      if (!b?.start_at || !b?.end_at) return null;

      const phase = getMatchListPhase(now, m.status, b.start_at, b.end_at);
      return {
        m,
        phase,
        startMs: new Date(b.start_at).getTime(),
      };
    })
    .filter((x): x is { m: MatchEnriched; phase: 'upcoming' | 'live' | 'past'; startMs: number } => x != null);

  const filtered = opts.includePast ? mapped : mapped.filter((x) => x.phase !== 'past');

  const upcomingOrLive = filtered
    .filter((x) => x.phase !== 'past')
    .sort((a, b) => a.startMs - b.startMs);

  const past = filtered
    .filter((x) => x.phase === 'past')
    // En Home suele interesar ver primero los más recientes terminados.
    .sort((a, b) => b.startMs - a.startMs);

  return [...upcomingOrLive, ...past].map((x) => x.m);
}

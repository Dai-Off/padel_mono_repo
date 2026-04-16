const { getMatchListPhase } = require('./matchLifecycle');

function normBooking(m) {
  const raw = m.bookings;
  return Array.isArray(raw) ? raw[0] : raw;
}

function selectMyUpcomingMatches(matches, playerId) {
  if (!playerId) return [];
  const now = Date.now();
  return matches
    .filter((m) => {
      const inMatch = (m.match_players || []).some((mp) => mp.players && mp.players.id === playerId);
      if (!inMatch) return false;
      const b = normBooking(m);
      if (!b || !b.start_at || !b.end_at) return false;
      return getMatchListPhase(now, m.status, b.start_at, b.end_at) !== 'past';
    })
    .sort((a, b) => {
      const ba = normBooking(a);
      const bb = normBooking(b);
      return new Date(ba.start_at).getTime() - new Date(bb.start_at).getTime();
    });
}

module.exports = { selectMyUpcomingMatches };

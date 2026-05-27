import type { MatchEnriched } from './matches';
import { getMatchBooking } from '../domain/matchLifecycle';

/** Supabase a veces expande relaciones 1:1 como array de un elemento. */
export function normalizeMatchEnriched(m: MatchEnriched): MatchEnriched {
  const booking = getMatchBooking(m);
  const match_players = (m.match_players ?? []).map((mp) => {
    const raw = mp.players;
    const players = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    return players === mp.players ? mp : { ...mp, players };
  });
  return {
    ...m,
    ...(booking ? { bookings: booking } : {}),
    match_players,
  };
}

export function normalizeMatchList(matches: MatchEnriched[]): MatchEnriched[] {
  return matches.map(normalizeMatchEnriched);
}

import { getSupabaseServiceRoleClient } from '../lib/supabase';

export type TournamentPairingTiebreakRow = { wins: number; losses: number };

/**
 * Partidos terminados en otros torneos del mismo club (cerrados), excluyendo `excludeTournamentId`.
 * Sirve para desempatar emparejamientos cuando el Elo es muy parecido.
 */
export async function computePairingTiebreakStatsForClub(
  clubId: string,
  excludeTournamentId: string
): Promise<Record<string, TournamentPairingTiebreakRow>> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: pastTournaments, error: tErr } = await supabase
    .from('tournaments')
    .select('id')
    .eq('club_id', clubId)
    .eq('status', 'closed')
    .neq('id', excludeTournamentId)
    .order('start_at', { ascending: false })
    .limit(40);
  if (tErr) throw new Error(tErr.message);
  const tournamentIds = (pastTournaments ?? []).map((r: { id: string }) => r.id).filter(Boolean);
  if (!tournamentIds.length) return {};

  const { data: matches, error: mErr } = await supabase
    .from('tournament_stage_matches')
    .select('team_a_id, team_b_id, winner_team_id')
    .in('tournament_id', tournamentIds)
    .eq('status', 'finished');
  if (mErr) throw new Error(mErr.message);

  const teamIds = new Set<string>();
  for (const row of matches ?? []) {
    const a = (row as any).team_a_id as string | null;
    const b = (row as any).team_b_id as string | null;
    if (a) teamIds.add(a);
    if (b) teamIds.add(b);
  }
  if (!teamIds.size) return {};

  const { data: teams, error: teamErr } = await supabase
    .from('tournament_teams')
    .select('id, player_id_1, player_id_2')
    .in('id', [...teamIds]);
  if (teamErr) throw new Error(teamErr.message);
  const byTeam = new Map<string, { p1: string | null; p2: string | null }>();
  for (const row of teams ?? []) {
    byTeam.set(String((row as any).id), {
      p1: (row as any).player_id_1 as string | null,
      p2: (row as any).player_id_2 as string | null,
    });
  }

  const stats: Record<string, TournamentPairingTiebreakRow> = {};
  const bump = (playerId: string | null | undefined, won: boolean) => {
    if (!playerId) return;
    if (!stats[playerId]) stats[playerId] = { wins: 0, losses: 0 };
    if (won) stats[playerId].wins += 1;
    else stats[playerId].losses += 1;
  };

  for (const row of matches ?? []) {
    const teamAId = (row as any).team_a_id as string | null;
    const teamBId = (row as any).team_b_id as string | null;
    const winnerId = (row as any).winner_team_id as string | null;
    if (!teamAId || !teamBId || !winnerId) continue;
    const ta = byTeam.get(teamAId);
    const tb = byTeam.get(teamBId);
    if (!ta || !tb) continue;
    const aWon = winnerId === teamAId;
    bump(ta.p1, aWon);
    bump(ta.p2, aWon);
    bump(tb.p1, !aWon);
    bump(tb.p2, !aWon);
  }
  return stats;
}

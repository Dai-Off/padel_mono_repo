import { getSupabaseServiceRoleClient } from './supabase';

type TournamentConflictParams = {
  clubId: string;
  courtIds: string[];
  startAt: string;
  endAt: string;
  excludeTournamentId?: string;
};

function overlaps(aStartMs: number, aEndMs: number, bStartMs: number, bEndMs: number): boolean {
  return aStartMs < bEndMs && aEndMs > bStartMs;
}

export async function findTournamentConflict(params: TournamentConflictParams): Promise<string | null> {
  const { clubId, courtIds, startAt, endAt, excludeTournamentId } = params;
  if (!clubId || !courtIds.length) return null;
  const reqStart = new Date(startAt).getTime();
  const reqEnd = new Date(endAt).getTime();
  if (!Number.isFinite(reqStart) || !Number.isFinite(reqEnd) || reqStart >= reqEnd) {
    return 'Rango horario inválido';
  }

  const supabase = getSupabaseServiceRoleClient();
  let q = supabase
    .from('tournaments')
    .select('id, start_at, end_at, status, tournament_courts(court_id)')
    .eq('club_id', clubId)
    .neq('status', 'cancelled');
  if (excludeTournamentId) q = q.neq('id', excludeTournamentId);
  const { data, error } = await q;
  if (error) return error.message;

  const requested = new Set(courtIds);
  for (const row of data ?? []) {
    const rowStart = new Date(String((row as { start_at: string }).start_at)).getTime();
    const rowEnd = new Date(String((row as { end_at: string }).end_at)).getTime();
    if (!overlaps(reqStart, reqEnd, rowStart, rowEnd)) continue;
    const used = (row as { tournament_courts?: { court_id: string }[] }).tournament_courts ?? [];
    if (used.some((x) => requested.has(x.court_id))) {
      return 'Conflicto: ya existe un torneo en esas canchas y horario';
    }
  }
  return null;
}

import { getSupabaseServiceRoleClient } from '../lib/supabase';

function playersPerInscription(row: { player_id_2?: string | null }): number {
  return row.player_id_2 ? 2 : 1;
}

type InscriptionSlotRow = { status: string; player_id_2?: string | null };

export function slotsFromInscriptionRows(rows: InscriptionSlotRow[] | null | undefined): {
  confirmedPlayers: number;
  pendingPlayers: number;
} {
  let confirmedPlayers = 0;
  let pendingPlayers = 0;
  for (const row of rows ?? []) {
    const count = playersPerInscription(row);
    const st = String(row.status);
    if (st === 'confirmed') confirmedPlayers += count;
    if (st === 'pending') pendingPlayers += count;
  }
  return { confirmedPlayers, pendingPlayers };
}

export function aggregateSlotsByTournamentId(
  rows: Array<{ tournament_id: string; status: string; player_id_2?: string | null }>
): Map<string, { confirmedPlayers: number; pendingPlayers: number }> {
  const map = new Map<string, { confirmedPlayers: number; pendingPlayers: number }>();
  for (const row of rows) {
    const tid = row.tournament_id;
    let e = map.get(tid);
    if (!e) {
      e = { confirmedPlayers: 0, pendingPlayers: 0 };
      map.set(tid, e);
    }
    const c = playersPerInscription(row);
    const st = String(row.status);
    if (st === 'confirmed') e.confirmedPlayers += c;
    if (st === 'pending') e.pendingPlayers += c;
  }
  return map;
}

let lastGlobalInviteCleanupAt = 0;
const GLOBAL_INVITE_CLEANUP_TTL_MS = 35_000;

/** Una sola UPDATE para todos los torneos; evita N limpiezas en lecturas repetidas (polling). */
export async function cleanupExpiredTournamentInvitesGloballyIfStale(): Promise<void> {
  const now = Date.now();
  if (now - lastGlobalInviteCleanupAt < GLOBAL_INVITE_CLEANUP_TTL_MS) return;
  lastGlobalInviteCleanupAt = now;
  const supabase = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  await supabase
    .from('tournament_inscriptions')
    .update({
      status: 'expired',
      updated_at: nowIso,
      cancelled_at: nowIso,
      cancelled_reason: 'TTL expired',
    })
    .eq('status', 'pending')
    .lte('expires_at', nowIso);
}

export async function cleanupExpiredTournamentInvites(tournamentId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  await supabase
    .from('tournament_inscriptions')
    .update({
      status: 'expired',
      updated_at: now,
      cancelled_at: now,
      cancelled_reason: 'TTL expired',
    })
    .eq('tournament_id', tournamentId)
    .eq('status', 'pending')
    .lte('expires_at', now);
}

export async function getTournamentSlots(tournamentId: string): Promise<{
  confirmedPlayers: number;
  pendingPlayers: number;
}> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tournament_inscriptions')
    .select('status, player_id_2')
    .eq('tournament_id', tournamentId);
  if (error) throw new Error(error.message);
  return slotsFromInscriptionRows(data as InscriptionSlotRow[]);
}

const lastTournamentStatusRefreshAt = new Map<string, number>();
const STATUS_REFRESH_COOLDOWN_MS = 18_000;

export async function refreshTournamentStatus(
  tournamentId: string,
  opts?: { force?: boolean; skipInviteCleanup?: boolean }
): Promise<void> {
  if (!opts?.force) {
    const last = lastTournamentStatusRefreshAt.get(tournamentId) ?? 0;
    if (Date.now() - last < STATUS_REFRESH_COOLDOWN_MS) return;
  }
  lastTournamentStatusRefreshAt.set(tournamentId, Date.now());

  const supabase = getSupabaseServiceRoleClient();
  if (!opts?.skipInviteCleanup) {
    await cleanupExpiredTournamentInvites(tournamentId);
  }
  const [{ data: tournament, error }, { data: insRows, error: insErr }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id, status, max_players, registration_closed_at')
      .eq('id', tournamentId)
      .maybeSingle(),
    supabase.from('tournament_inscriptions').select('status, player_id_2').eq('tournament_id', tournamentId),
  ]);
  if (error || !tournament) return;
  if (insErr) return;
  if ((tournament as { status: string }).status === 'cancelled') return;

  const nowMs = Date.now();
  const closeAt = (tournament as { registration_closed_at?: string | null }).registration_closed_at;
  const closeByTime = closeAt ? nowMs >= new Date(closeAt).getTime() : false;
  const { confirmedPlayers } = slotsFromInscriptionRows(insRows as InscriptionSlotRow[]);
  const closeByCapacity = confirmedPlayers >= Number((tournament as { max_players: number }).max_players);
  const shouldClose = closeByTime || closeByCapacity;
  const nextStatus = shouldClose ? 'closed' : 'open';
  if (nextStatus !== (tournament as { status: string }).status) {
    await supabase
      .from('tournaments')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
        closed_at: shouldClose ? new Date().toISOString() : null,
      })
      .eq('id', tournamentId);
  }
}

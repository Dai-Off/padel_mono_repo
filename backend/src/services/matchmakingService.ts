import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { hasCourtConflict } from './bookingService';
import { estimateBookingPriceCents } from './bookingPricing';
import { runMatchmakingExpansionScan } from './matchmakingExpansion';
import { maxLeagueSpread } from './matchmakingLeague';
import {
  type PoolRow,
  type QuartetPreCourtContext,
  type SkillRow,
  MAX_LEVEL_SPREAD,
  BASE_WIN_PROB_MIN,
  BASE_WIN_PROB_MAX,
  STREAK_THRESHOLD,
  buildUnits,
  iterUnitCombos,
  resolveClubId,
  quartetPreCourtValid,
  intersectRange,
  exceedsLevelSpread,
  bestTeamSplitSync,
} from './matchmakingShared';

export { exceedsLevelSpread, bestTeamSplitSync, MAX_LEVEL_SPREAD, BASE_WIN_PROB_MIN, BASE_WIN_PROB_MAX, STREAK_THRESHOLD };
export type { PoolRow, SkillRow } from './matchmakingShared';

const MAX_UNIT_COMBINATIONS = 12000;

export type MatchmakingCycleResult = {
  formed: number;
  expired: number;
  expansion_prompts: number;
  /** Solo si `MATCHMAKING_RUN_DIAG=1` en el servidor (dev). */
  diag?: Record<string, number | string | null>;
};
const REJECT_FAULT_EXPIRY_DAYS = 30;
const MATCHMAKING_BLOCK_DAYS = 2;
const REJECT_LPS_PENALTY_1 = 5;
const REJECT_LPS_PENALTY_2 = 10;
const REJECT_LPS_PENALTY_3_PLUS = 15;

async function buildSynergyMap(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  ids: string[],
): Promise<Map<string, number>> {
  const set = new Set(ids);
  const m = new Map<string, number>();
  if (set.size < 2) return m;
  const { data } = await supabase.from('player_synergies').select('player_id_1, player_id_2, value').in('player_id_1', ids);
  for (const row of data ?? []) {
    const a = (row as { player_id_1: string }).player_id_1;
    const b = (row as { player_id_2: string }).player_id_2;
    if (!set.has(b)) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    m.set(key, Number((row as { value: number }).value));
  }
  return m;
}

/** Plazo para pagar / declinar explícitamente; no acorta a minutos por error al cerrar Stripe. */
function confirmDeadlineIsoMatchmaking(matchStartMs: number): string {
  const now = Date.now();
  const minFromNow = 24 * 60 * 60 * 1000;
  const maxFromNow = 72 * 60 * 60 * 1000;
  const twoHoursBeforeKick = matchStartMs - 2 * 60 * 60 * 1000;
  let deadline = now + minFromNow;
  if (Number.isFinite(matchStartMs) && matchStartMs > now) {
    deadline = Math.min(deadline, twoHoursBeforeKick);
  }
  if (deadline <= now) deadline = now + minFromNow;
  deadline = Math.max(deadline, now + 15 * 60 * 1000);
  deadline = Math.min(deadline, now + maxFromNow);
  return new Date(deadline).toISOString();
}

export async function releaseMatchmakingProposal(
  matchId: string,
  options?: { cancelBooking?: boolean; bookingId?: string | null },
): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  let bookingId = options?.bookingId ?? null;
  if (bookingId == null) {
    const { data: m } = await supabase.from('matches').select('booking_id').eq('id', matchId).maybeSingle();
    bookingId = (m as { booking_id?: string | null } | null)?.booking_id ?? null;
  }

  const { data: mps } = await supabase.from('match_players').select('player_id').eq('match_id', matchId);
  const playerIds = new Set<string>();
  for (const row of mps ?? []) {
    playerIds.add((row as { player_id: string }).player_id);
  }
  const { data: poolByProposal } = await supabase
    .from('matchmaking_pool')
    .select('player_id')
    .eq('proposed_match_id', matchId);
  for (const row of poolByProposal ?? []) {
    playerIds.add((row as { player_id: string }).player_id);
  }

  if (options?.cancelBooking !== false && bookingId) {
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_by: 'system',
        cancellation_reason: 'matchmaking_release',
        cancelled_at: now,
        updated_at: now,
      })
      .eq('id', bookingId);
  }
  await supabase.from('matches').update({ status: 'cancelled', updated_at: now }).eq('id', matchId);

  const ids = [...playerIds];
  if (ids.length > 0) {
    const { error: poolErr } = await supabase
      .from('matchmaking_pool')
      .update({ status: 'searching', proposed_match_id: null, updated_at: now })
      .in('player_id', ids);
    if (poolErr) {
      console.error('[releaseMatchmakingProposal] pool update:', poolErr.message);
    }
  }
}

export async function expireOverdueMatchmakingProposals(): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const { data: matches } = await supabase
    .from('matches')
    .select('id, booking_id')
    .eq('type', 'matchmaking')
    .eq('status', 'pending')
    .not('matchmaking_confirm_deadline_at', 'is', null)
    .lt('matchmaking_confirm_deadline_at', now);

  let n = 0;
  for (const m of matches ?? []) {
    const bid = (m as { booking_id?: string }).booking_id;
    if (!bid) continue;
    const { data: b } = await supabase.from('bookings').select('status').eq('id', bid).maybeSingle();
    if ((b as { status?: string } | null)?.status !== 'pending_payment') continue;
    await releaseMatchmakingProposal((m as { id: string }).id, { bookingId: bid, cancelBooking: true });
    n++;
  }
  return n;
}

export async function runMatchmakingCycle(): Promise<MatchmakingCycleResult> {
  const supabase = getSupabaseServiceRoleClient();
  const expired = await expireOverdueMatchmakingProposals();
  const expansion_prompts = await runMatchmakingExpansionScan();
  const wantDiag = process.env.MATCHMAKING_RUN_DIAG === '1';

  const nowIso = new Date().toISOString();
  const { data: pool } = await supabase
    .from('matchmaking_pool')
    .select(
      'id, player_id, paired_with_id, club_id, max_distance_km, preferred_side, gender, available_from, available_until, expires_at, search_lat, search_lng',
    )
    .eq('status', 'searching');

  const rows = ((pool ?? []) as PoolRow[]).filter((r) => {
    const ex = r.expires_at;
    return !ex || new Date(ex).getTime() > Date.now();
  });

  if (rows.length < 4) {
    return {
      formed: 0,
      expired,
      expansion_prompts,
      ...(wantDiag && {
        diag: {
          searching_pool_rows: (pool ?? []).length,
          eligible_after_expiry_filter: rows.length,
          note: 'Se necesitan al menos 4 filas searching no expiradas',
        },
      }),
    };
  }

  const units = buildUnits(rows);
  const poolIds = [...new Set(rows.map((r) => r.player_id))];

  const clubIdsForGeo = [...new Set(rows.map((r) => r.club_id).filter(Boolean))] as string[];
  const clubPosById = new Map<string, { lat: number; lng: number }>();
  if (clubIdsForGeo.length) {
    const { data: clubRows } = await supabase.from('clubs').select('id, lat, lng').in('id', clubIdsForGeo);
    for (const c of clubRows ?? []) {
      const row = c as { id: string; lat: number | null; lng: number | null };
      if (row.lat != null && row.lng != null && Number.isFinite(row.lat) && Number.isFinite(row.lng)) {
        clubPosById.set(row.id, { lat: row.lat, lng: row.lng });
      }
    }
  }

  const { data: hist } = await supabase
    .from('match_players')
    .select('player_id, result, created_at')
    .in('player_id', poolIds)
    .in('result', ['win', 'loss'])
    .order('created_at', { ascending: false });

  const recentById = new Map<string, ('win' | 'loss')[]>();
  for (const h of hist ?? []) {
    const pid = (h as { player_id: string }).player_id;
    const r = (h as { result: string }).result as 'win' | 'loss';
    const arr = recentById.get(pid) ?? [];
    if (arr.length >= STREAK_THRESHOLD) continue;
    arr.push(r);
    recentById.set(pid, arr);
  }

  const { data: skillRows } = await supabase
    .from('players')
    .select('id, mu, sigma, beta, elo_rating, sex, liga')
    .in('id', poolIds);

  const skillsById = new Map<string, SkillRow>();
  const eloById = new Map<string, number>();
  const sexById = new Map<string, string | null>();
  const ligaById = new Map<string, string>();
  for (const p of skillRows ?? []) {
    const row = p as { id: string; mu: number; sigma: number; beta: number; elo_rating: number; sex: string | null; liga?: string | null };
    skillsById.set(row.id, { mu: row.mu, sigma: row.sigma, beta: row.beta });
    eloById.set(row.id, Number(row.elo_rating));
    sexById.set(row.id, row.sex ?? null);
    ligaById.set(row.id, row.liga ?? 'bronce');
  }

  const synergyMap = await buildSynergyMap(supabase, poolIds);

  const ctx: QuartetPreCourtContext = {
    clubPosById,
    eloById,
    recentById,
    sexById,
    skillsById,
    synergyMap,
    ligaById,
  };

  let best: {
    flatRows: PoolRow[];
    ids: string[];
    split: { teamA: string[]; teamB: string[]; winProb: number; score: number };
    clubId: string;
    slot: { start: string; end: string };
    courtId: string;
    leagueSpread: number;
  } | null = null;

  let comboCount = 0;
  let dNoClub = 0;
  let dPreCourt = 0;
  let dNoSlot = 0;
  let dNoCourt = 0;
  let firstCourtConflict: string | null = null;

  for (const combo of iterUnitCombos(units, 4, 0, [])) {
    comboCount++;
    if (comboCount > MAX_UNIT_COMBINATIONS) break;

    const flatRows = combo.flatMap((u) => u.rows);
    const ids = combo.flatMap((u) => u.players);
    if (ids.length !== 4) continue;

    const clubId = resolveClubId(flatRows);
    if (!clubId) {
      if (wantDiag) dNoClub++;
      continue;
    }

    const q = quartetPreCourtValid(flatRows, ids, clubId, ctx);
    if (!q) {
      if (wantDiag) dPreCourt++;
      continue;
    }

    const rawSlot = intersectRange(flatRows);
    if (!rawSlot) {
      if (wantDiag) dNoSlot++;
      continue;
    }
    const MM_SLOT_MS = 90 * 60 * 1000;
    const slotStartMs = new Date(rawSlot.start).getTime();
    const slotEndMs = Math.min(new Date(rawSlot.end).getTime(), slotStartMs + MM_SLOT_MS);
    const slot = { start: new Date(slotStartMs).toISOString(), end: new Date(slotEndMs).toISOString() };

    const { data: courtList } = await supabase
      .from('courts')
      .select('id')
      .eq('club_id', clubId)
      .eq('is_hidden', false)
      .order('id');
    let courtId: string | null = null;
    for (const c of courtList ?? []) {
      const cid = (c as { id: string }).id;
      const conflict = await hasCourtConflict(cid, slot.start, slot.end);
      if (!conflict) {
        courtId = cid;
        break;
      }
      if (wantDiag && firstCourtConflict == null && typeof conflict === 'string') {
        firstCourtConflict = conflict.length > 200 ? `${conflict.slice(0, 200)}…` : conflict;
      }
    }
    if (!courtId) {
      if (wantDiag) dNoCourt++;
      continue;
    }

    const ls = maxLeagueSpread(ids, ligaById);
    const split = q.split;
    const better =
      !best ||
      split.score > best.split.score + 1e-9 ||
      (Math.abs(split.score - best.split.score) < 1e-9 && ls < best.leagueSpread);

    if (better) {
      best = { flatRows, ids, split, clubId, slot, courtId, leagueSpread: ls };
    }
  }

  if (!best) {
    return {
      formed: 0,
      expired,
      expansion_prompts,
      ...(wantDiag && {
        diag: {
          searching_pool_rows: rows.length,
          distinct_players: poolIds.length,
          players_with_skill_row: skillRows?.length ?? 0,
          units: units.length,
          combos_evaluated: comboCount,
          reject_no_common_club: dNoClub,
          reject_quartet_pre_court: dPreCourt,
          reject_no_intersect_slot: dNoSlot,
          reject_no_free_visible_court: dNoCourt,
          first_court_conflict: firstCourtConflict,
          hint:
            'reject_quartet_pre_court incluye elo/ligas/género y balance OpenSkill (win prob 0.35–0.65). ' +
            'reject_no_free_visible_court: bookings, cursos escuela en pista o torneo en cancha/horario.',
        },
      }),
    };
  }

  let totalCents: number;
  try {
    totalCents = await estimateBookingPriceCents(supabase, best.courtId, best.slot.start, best.slot.end);
  } catch {
    totalCents = 8000;
  }
  const shareCents = Math.ceil(totalCents / 4);
  const organizer = best.ids[0];
  const deadlineAt = confirmDeadlineIsoMatchmaking(new Date(best.slot.start).getTime());

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .insert([
      {
        court_id: best.courtId,
        organizer_player_id: organizer,
        start_at: best.slot.start,
        end_at: best.slot.end,
        timezone: 'Europe/Madrid',
        total_price_cents: totalCents,
        currency: 'EUR',
        status: 'pending_payment',
        source_channel: 'system',
      },
    ])
    .select('id')
    .maybeSingle();
  if (bErr || !booking) return { formed: 0, expired, expansion_prompts };

  const { data: match, error: mErr } = await supabase
    .from('matches')
    .insert([
      {
        booking_id: booking.id,
        visibility: 'public',
        gender: 'any',
        competitive: true,
        status: 'pending',
        type: 'matchmaking',
        score_status: 'pending',
        elo_min: null,
        elo_max: null,
        matchmaking_confirm_deadline_at: deadlineAt,
      },
    ])
    .select('id')
    .maybeSingle();
  if (mErr || !match) {
    await supabase.from('bookings').delete().eq('id', booking.id);
    return { formed: 0, expired, expansion_prompts };
  }

  const matchId = match.id as string;
  const preA = best.split.winProb;
  const preB = 1 - preA;

  const participantRows = best.ids.map((pid, idx) => ({
    booking_id: booking.id,
    player_id: pid,
    role: idx === 0 ? ('organizer' as const) : ('guest' as const),
    share_amount_cents: shareCents,
    payment_status: 'pending' as const,
  }));

  const { error: bpErr } = await supabase.from('booking_participants').insert(participantRows);
  if (bpErr) {
    await supabase.from('matches').delete().eq('id', matchId);
    await supabase.from('bookings').delete().eq('id', booking.id);
    return { formed: 0, expired, expansion_prompts };
  }

  const inserts = [];
  let si = 0;
  for (const pid of best.split.teamA) {
    inserts.push({
      match_id: matchId,
      player_id: pid,
      team: 'A',
      invite_status: 'accepted',
      slot_index: si++,
      pre_match_win_prob: preA,
    });
  }
  si = 2;
  for (const pid of best.split.teamB) {
    inserts.push({
      match_id: matchId,
      player_id: pid,
      team: 'B',
      invite_status: 'accepted',
      slot_index: si++,
      pre_match_win_prob: preB,
    });
  }

  const { error: mpErr } = await supabase.from('match_players').insert(inserts);
  if (mpErr) {
    await supabase.from('booking_participants').delete().eq('booking_id', booking.id);
    await supabase.from('matches').delete().eq('id', matchId);
    await supabase.from('bookings').delete().eq('id', booking.id);
    return { formed: 0, expired, expansion_prompts };
  }

  for (const q of best.flatRows) {
    await supabase
      .from('matchmaking_pool')
      .update({ status: 'matched', proposed_match_id: matchId, updated_at: nowIso })
      .eq('player_id', q.player_id);
  }

  return { formed: 1, expired, expansion_prompts };
}

export async function getMatchmakingBlockUntil(playerId: string): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { data: row } = await supabase
    .from('matchmaking_player_blocks')
    .select('blocked_until')
    .eq('player_id', playerId)
    .maybeSingle();
  const blockedUntil = (row as { blocked_until?: string | null } | null)?.blocked_until ?? null;
  if (!blockedUntil) return null;
  if (new Date(blockedUntil).getTime() <= Date.now()) {
    await supabase.from('matchmaking_player_blocks').delete().eq('player_id', playerId).lte('blocked_until', nowIso);
    return null;
  }
  return blockedUntil;
}

export async function applyMatchmakingRejectPenalty(
  rejecterPlayerId: string,
  matchId?: string,
): Promise<{ penalty_lps: number; active_faults: number; blocked_until: string | null }> {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + REJECT_FAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('matchmaking_reject_faults').delete().eq('player_id', rejecterPlayerId).lte('expires_at', nowIso);
  await supabase.from('matchmaking_reject_faults').insert({
    player_id: rejecterPlayerId,
    match_id: matchId ?? null,
    expires_at: expiresAt,
  });

  const { count: activeFaults } = await supabase
    .from('matchmaking_reject_faults')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', rejecterPlayerId)
    .gt('expires_at', nowIso);
  const faults = Number(activeFaults ?? 0);

  const penalty =
    faults <= 1 ? REJECT_LPS_PENALTY_1 : faults === 2 ? REJECT_LPS_PENALTY_2 : REJECT_LPS_PENALTY_3_PLUS;

  const { data: pl, error } = await supabase.from('players').select('id, lps').eq('id', rejecterPlayerId).maybeSingle();
  if (error || !pl) throw new Error(error?.message ?? 'Jugador no encontrado');

  const cur = Number((pl as { lps?: number }).lps ?? 0);
  await supabase
    .from('players')
    .update({
      lps: Math.max(0, cur - penalty),
      updated_at: nowIso,
    })
    .eq('id', rejecterPlayerId);

  const { data: poolRow } = await supabase
    .from('matchmaking_pool')
    .select('reject_count')
    .eq('player_id', rejecterPlayerId)
    .maybeSingle();
  const rc = Number((poolRow as { reject_count?: number } | null)?.reject_count ?? 0);
  await supabase
    .from('matchmaking_pool')
    .update({ reject_count: rc + 1, updated_at: nowIso })
    .eq('player_id', rejecterPlayerId);

  let blockedUntil: string | null = null;
  if (faults >= 3) {
    blockedUntil = new Date(now.getTime() + MATCHMAKING_BLOCK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('matchmaking_player_blocks').upsert(
      {
        player_id: rejecterPlayerId,
        blocked_until: blockedUntil,
        updated_at: nowIso,
      },
      { onConflict: 'player_id' },
    );
    await supabase.from('matchmaking_pool').delete().eq('player_id', rejecterPlayerId);
  }

  return { penalty_lps: penalty, active_faults: faults, blocked_until: blockedUntil };
}

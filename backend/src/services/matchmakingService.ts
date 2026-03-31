import { rating, rate, predictWin } from 'openskill';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { hasCourtConflict } from '../lib/courtConflict';
import { calcEloRating } from './levelingService';

export const MAX_LEVEL_SPREAD = 1.0;
export const BASE_WIN_PROB_MIN = 0.35;
export const BASE_WIN_PROB_MAX = 0.65;
export const STREAK_THRESHOLD = 4;

type PoolRow = {
  id: string;
  player_id: string;
  paired_with_id: string | null;
  club_id: string | null;
  gender: string;
  available_from: string;
  available_until: string;
};

type PlayerLite = { id: string; elo_rating: number };

export async function getSynergy(id1: string, id2: string): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const [a, b] = id1 < id2 ? [id1, id2] : [id2, id1];
  const { data } = await supabase
    .from('player_synergies')
    .select('value')
    .eq('player_id_1', a)
    .eq('player_id_2', b)
    .maybeSingle();
  return (data?.value as number) ?? 0;
}

export function exceedsLevelSpread(elos: number[]): boolean {
  if (!elos.length) return true;
  const mn = Math.min(...elos);
  const mx = Math.max(...elos);
  return mx - mn > MAX_LEVEL_SPREAD;
}

export async function adjustEloRangeByTrend(
  playerId: string,
  baseMin: number,
  baseMax: number
): Promise<{ min: number; max: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: recent } = await supabase
    .from('match_players')
    .select('result')
    .eq('player_id', playerId)
    .in('result', ['win', 'loss'])
    .order('created_at', { ascending: false })
    .limit(STREAK_THRESHOLD);
  const list = (recent ?? []) as { result: string }[];
  if (list.length < STREAK_THRESHOLD) return { min: baseMin, max: baseMax };
  const wins = list.filter((x) => x.result === 'win').length;
  const losses = list.filter((x) => x.result === 'loss').length;
  if (wins === STREAK_THRESHOLD) return { min: baseMin, max: baseMax + 0.3 };
  if (losses === STREAK_THRESHOLD) return { min: baseMin - 0.3, max: baseMax };
  return { min: baseMin, max: baseMax };
}

export async function bestTeamSplit(
  players: PlayerLite[],
  pairFixed: [string, string] | null
): Promise<{ teamA: string[]; teamB: string[]; winProb: number } | null> {
  const ids = players.map((p) => p.id);
  if (ids.length !== 4) return null;

  const supabase = getSupabaseServiceRoleClient();
  const { data: rows } = await supabase
    .from('players')
    .select('id, mu, sigma, beta')
    .in('id', ids);
  const byId = new Map((rows ?? []).map((r: { id: string; mu: number; sigma: number; beta: number }) => [r.id, r]));

  const rateFor = (pid: string) => {
    const r = byId.get(pid);
    if (!r) return rating({ mu: 25, sigma: 8.333 }, { beta: 4.167 });
    return rating({ mu: r.mu, sigma: r.sigma }, { beta: r.beta });
  };

  const candidates: { a: string[]; b: string[] }[] = [];
  if (pairFixed) {
    const [p1, p2] = pairFixed;
    const rest = ids.filter((x) => x !== p1 && x !== p2);
    if (rest.length === 2) candidates.push({ a: [p1, p2], b: rest });
  } else {
    const [x, y, z, w] = ids;
    candidates.push({ a: [x, y], b: [z, w] });
    candidates.push({ a: [x, z], b: [y, w] });
    candidates.push({ a: [x, w], b: [y, z] });
  }

  let best: { teamA: string[]; teamB: string[]; winProb: number; score: number } | null = null;

  for (const c of candidates) {
    const ra = c.a.map(rateFor);
    const rb = c.b.map(rateFor);
    const probs = predictWin([ra, rb]);
    const pA = probs[0] ?? 0.5;
    if (pA < BASE_WIN_PROB_MIN || pA > BASE_WIN_PROB_MAX) continue;
    const s1 = await getSynergy(c.a[0], c.a[1]);
    const s2 = await getSynergy(c.b[0], c.b[1]);
    const synergyScore = (s1 + s2) * 0.05;
    const balanceScore = 1 - Math.abs(0.5 - pA) * 2;
    const score = balanceScore + synergyScore;
    if (!best || score > best.score) {
      best = { teamA: c.a, teamB: c.b, winProb: pA, score };
    }
  }

  return best ? { teamA: best.teamA, teamB: best.teamB, winProb: best.winProb } : null;
}

function overlap(aFrom: string, aUntil: string, bFrom: string, bUntil: string): boolean {
  const af = new Date(aFrom).getTime();
  const au = new Date(aUntil).getTime();
  const bf = new Date(bFrom).getTime();
  const bu = new Date(bUntil).getTime();
  return af < bu && bf < au;
}

function intersectRange(entries: PoolRow[]): { start: string; end: string } | null {
  let start = 0;
  let end = Infinity;
  for (const e of entries) {
    const sf = new Date(e.available_from).getTime();
    const et = new Date(e.available_until).getTime();
    start = Math.max(start, sf);
    end = Math.min(end, et);
  }
  if (!Number.isFinite(end) || start >= end) return null;
  const minDur = 60 * 60 * 1000;
  if (end - start < minDur) return null;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export async function runMatchmakingCycle(): Promise<{ formed: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { data: pool } = await supabase
    .from('matchmaking_pool')
    .select('id, player_id, paired_with_id, club_id, gender, available_from, available_until, expires_at')
    .eq('status', 'searching');

  const rows = ((pool ?? []) as PoolRow[]).filter((r) => {
    const ex = (r as { expires_at?: string | null }).expires_at;
    return !ex || new Date(ex).getTime() > Date.now();
  });
  const used = new Set<string>();
  let formed = 0;

  const byGender = new Map<string, PoolRow[]>();
  for (const r of rows) {
    const g = r.gender || 'any';
    if (!byGender.has(g)) byGender.set(g, []);
    byGender.get(g)!.push(r);
  }

  for (const group of byGender.values()) {
    group.sort((a, b) => a.available_from.localeCompare(b.available_from));
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      if (used.has(a.player_id)) continue;

      const quartet: PoolRow[] = [];

      if (a.paired_with_id) {
        const partner = group.find((x) => x.player_id === a.paired_with_id && !used.has(x.player_id));
        if (!partner) continue;
        if (!overlap(a.available_from, a.available_until, partner.available_from, partner.available_until)) continue;
        quartet.push(a, partner);
      } else {
        quartet.push(a);
      }

      for (const c of group) {
        if (quartet.length >= 4) break;
        if (used.has(c.player_id)) continue;
        if (quartet.some((q) => q.player_id === c.player_id)) continue;
        if (c.paired_with_id) {
          const p2 = group.find((x) => x.player_id === c.paired_with_id && !used.has(x.player_id));
          if (!p2) continue;
          if (!overlap(c.available_from, c.available_until, p2.available_from, p2.available_until)) continue;
          if (quartet.length + 2 > 4) continue;
          if (!quartet.every((q) => overlap(q.available_from, q.available_until, c.available_from, c.available_until)))
            continue;
          quartet.push(c, p2);
        } else {
          if (!quartet.every((q) => overlap(q.available_from, q.available_until, c.available_from, c.available_until)))
            continue;
          quartet.push(c);
        }
      }

      if (quartet.length !== 4) continue;

      const clubId = quartet.find((q) => q.club_id)?.club_id;
      if (!clubId) continue;

      const { data: courtRows } = await supabase.from('courts').select('id').eq('club_id', clubId).limit(1);
      const courtId = (courtRows?.[0] as { id?: string } | undefined)?.id;
      if (!courtId) continue;

      const slot = intersectRange(quartet);
      if (!slot) continue;

      const conflict = await hasCourtConflict(courtId, slot.start, slot.end);
      if (conflict) continue;

      const pids = quartet.map((q) => q.player_id);
      const { data: pls } = await supabase.from('players').select('id, elo_rating').in('id', pids);
      const playersLite = (pls ?? []) as PlayerLite[];
      if (playersLite.length !== 4) continue;

      const elos = playersLite.map((p) => p.elo_rating);
      if (exceedsLevelSpread(elos)) continue;

      const pairA =
        quartet[0].paired_with_id === quartet[1].player_id
          ? ([quartet[0].player_id, quartet[1].player_id] as [string, string])
          : quartet[2].paired_with_id === quartet[3].player_id
            ? ([quartet[2].player_id, quartet[3].player_id] as [string, string])
            : null;

      const split = await bestTeamSplit(playersLite, pairA);
      if (!split) continue;

      const organizer = pids[0];
      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .insert([
          {
            court_id: courtId,
            organizer_player_id: organizer,
            start_at: slot.start,
            end_at: slot.end,
            timezone: 'Europe/Madrid',
            total_price_cents: 0,
            currency: 'EUR',
            status: 'confirmed',
            source_channel: 'system',
          },
        ])
        .select('id')
        .maybeSingle();
      if (bErr || !booking) continue;

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
          },
        ])
        .select('id')
        .maybeSingle();
      if (mErr || !match) continue;

      const matchId = match.id as string;
      const preA = split.winProb;
      const preB = 1 - preA;

      const inserts = [];
      let si = 0;
      for (const pid of split.teamA) {
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
      for (const pid of split.teamB) {
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
      if (mpErr) continue;

      for (const q of quartet) {
        used.add(q.player_id);
        await supabase
          .from('matchmaking_pool')
          .update({ status: 'matched', proposed_match_id: matchId, updated_at: nowIso })
          .eq('player_id', q.player_id);
      }
      formed++;
    }
  }

  return { formed };
}

export async function applyMatchmakingRejectPenalty(rejecterPlayerId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: pl, error } = await supabase
    .from('players')
    .select('id, mu, sigma, beta, elo_rating, beta_residuals')
    .eq('id', rejecterPlayerId)
    .maybeSingle();
  if (error || !pl) throw new Error(error?.message ?? 'Jugador no encontrado');

  const p = pl as {
    id: string;
    mu: number;
    sigma: number;
    beta: number;
    elo_rating: number;
    beta_residuals: unknown;
  };
  const rL = rating({ mu: p.mu, sigma: p.sigma }, { beta: p.beta });
  const rStrong = rating({ mu: 32, sigma: 4 }, { beta: 4.167 });
  const out = rate([[rL], [rStrong]], { rank: [2, 1] });
  const newR = out[0]?.[0];
  if (!newR) return;

  const newElo = calcEloRating(newR.mu, newR.sigma);

  await supabase
    .from('players')
    .update({
      mu: newR.mu,
      sigma: newR.sigma,
      elo_rating: newElo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', p.id);
}

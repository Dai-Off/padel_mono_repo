import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { calcScoreMargin, type ScoreSet } from './levelingService';

const REPEATED_RESULTS_THRESHOLD = 5;
const PREDICTION_FAILURE_THRESHOLD = 3;
const PREDICTION_MIN_PROB = 0.95;
const SANDBAGGING_WINDOW = 20;
const CLOSED_GROUP_WINDOW = 30;
const CLOSED_GROUP_THRESHOLD_PCT = 0.8;
const CLOSED_GROUP_MAX_RIVALS = 5;
const SCORE_MARGIN_THRESHOLD = 1.3;
const STRATEGIC_RETIREMENT_MIN_RATE = 0.7;
const STRATEGIC_RETIREMENT_MIN_COUNT = 3;

async function upsertAlert(
  detectionType: string,
  playerIds: string[],
  matchIds: string[],
  details: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing } = await supabase
    .from('fraud_alerts')
    .select('id, match_ids')
    .eq('detection_type', detectionType)
    .eq('status', 'open')
    .contains('player_ids', [playerIds[0]])
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const prev = (existing.match_ids as string[]) ?? [];
    const merged = [...new Set([...prev, ...matchIds])];
    await supabase.from('fraud_alerts').update({ match_ids: merged, details }).eq('id', existing.id);
    return;
  }

  await supabase.from('fraud_alerts').insert({
    detection_type: detectionType,
    player_ids: playerIds,
    match_ids: matchIds,
    details,
    status: 'open',
  });
}

function parseSets(raw: unknown): ScoreSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      const a = Number(o.a);
      const b = Number(o.b);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return { a, b };
    })
    .filter((x): x is ScoreSet => x != null);
}

export async function checkRepeatedResults(matchId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: mps } = await supabase.from('match_players').select('player_id, result').eq('match_id', matchId);
  if (!mps?.length) return;
  for (const row of mps) {
    const pid = (row as { player_id: string }).player_id;
    const { data: hist } = await supabase
      .from('match_players')
      .select('result, match_id')
      .eq('player_id', pid)
      .neq('result', 'pending')
      .order('created_at', { ascending: false })
      .limit(REPEATED_RESULTS_THRESHOLD + 2);
    const results = (hist ?? []).map((h: { result: string }) => h.result);
    const cur = (row as { result: string }).result;
    if (cur === 'pending') continue;
    let streak = 0;
    for (const r of results) {
      if (r === cur) streak++;
      else break;
    }
    if (streak >= REPEATED_RESULTS_THRESHOLD) {
      await upsertAlert(
        'repeated_results',
        [pid],
        [matchId],
        { streak, result: cur }
      );
    }
  }
}

export async function checkPredictionFailures(matchId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: mps } = await supabase
    .from('match_players')
    .select('player_id, result, pre_match_win_prob')
    .eq('match_id', matchId);
  if (!mps) return;
  for (const row of mps) {
    const r = row as { player_id: string; result: string; pre_match_win_prob: number | null };
    if (r.pre_match_win_prob == null || r.result === 'pending') continue;
    if (r.pre_match_win_prob < PREDICTION_MIN_PROB) continue;
    if (r.result !== 'loss') continue;

    const { data: hist } = await supabase
      .from('match_players')
      .select('result, pre_match_win_prob, match_id')
      .eq('player_id', r.player_id)
      .gt('pre_match_win_prob', PREDICTION_MIN_PROB)
      .eq('result', 'loss')
      .order('created_at', { ascending: false })
      .limit(PREDICTION_FAILURE_THRESHOLD + 2);

    const count = (hist ?? []).length;
    if (count >= PREDICTION_FAILURE_THRESHOLD) {
      await upsertAlert('prediction_failure', [r.player_id], [matchId], { count });
    }
  }
}

export async function checkSandbagging(matchId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: mps } = await supabase.from('match_players').select('player_id').eq('match_id', matchId);
  if (!mps) return;
  for (const row of mps) {
    const pid = (row as { player_id: string }).player_id;
    const { data: recent } = await supabase
      .from('match_players')
      .select('result, match_id')
      .eq('player_id', pid)
      .in('result', ['win', 'loss'])
      .order('created_at', { ascending: false })
      .limit(SANDBAGGING_WINDOW);
    const list = recent ?? [];
    if (list.length < SANDBAGGING_WINDOW) continue;
    const wins = list.filter((x: { result: string }) => x.result === 'win').length;
    const wr = wins / list.length;
    if (wr > 0.9 || wr < 0.1) {
      await upsertAlert('sandbagging', [pid], [matchId], { win_rate_window: wr, window: SANDBAGGING_WINDOW });
    }
  }
}

export async function checkClosedGroupInflation(matchId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: mps } = await supabase.from('match_players').select('player_id').eq('match_id', matchId);
  if (!mps) return;
  for (const row of mps) {
    const pid = (row as { player_id: string }).player_id;
    const { data: recent } = await supabase
      .from('match_players')
      .select('match_id, player_id')
      .eq('player_id', pid)
      .order('created_at', { ascending: false })
      .limit(CLOSED_GROUP_WINDOW * 4);
    const rivals = new Set<string>();
    let total = 0;
    const matchRivalMap = new Map<string, Set<string>>();
    for (const mp of recent ?? []) {
      const m = mp as { match_id: string; player_id: string };
      if (!matchRivalMap.has(m.match_id)) matchRivalMap.set(m.match_id, new Set());
      matchRivalMap.get(m.match_id)!.add(m.player_id);
    }
    for (const [, ids] of matchRivalMap) {
      const arr = [...ids];
      if (arr.length < 2) continue;
      total++;
      for (const other of arr) {
        if (other !== pid) rivals.add(other);
      }
    }
    if (total === 0) continue;
    const pctSameSmallGroup = rivals.size <= CLOSED_GROUP_MAX_RIVALS ? 1 : rivals.size / total;
    if (rivals.size <= CLOSED_GROUP_MAX_RIVALS && total >= CLOSED_GROUP_WINDOW * 0.5) {
      if (pctSameSmallGroup >= CLOSED_GROUP_THRESHOLD_PCT) {
        await upsertAlert('closed_group_inflation', [pid], [matchId], {
          unique_rivals: rivals.size,
          matches_sample: total,
        });
      }
    }
  }
}

export async function checkScoreManipulation(matchId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: match } = await supabase
    .from('matches')
    .select('sets, id')
    .eq('id', matchId)
    .maybeSingle();
  if (!match) return;
  const sets = parseSets(match.sets);
  const margin = calcScoreMargin(sets);
  if (margin <= SCORE_MARGIN_THRESHOLD) return;

  const { data: mps } = await supabase.from('match_players').select('player_id, pre_match_win_prob').eq('match_id', matchId);
  for (const row of mps ?? []) {
    const p = row as { player_id: string; pre_match_win_prob: number | null };
    if (p.pre_match_win_prob == null) continue;
    if (p.pre_match_win_prob >= 0.45 && p.pre_match_win_prob <= 0.55) {
      await upsertAlert('score_manipulation', [p.player_id], [matchId], {
        score_margin: margin,
        pre_match_win_prob: p.pre_match_win_prob,
      });
    }
  }
}

export async function checkStrategicRetirement(matchId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: match } = await supabase
    .from('matches')
    .select('match_end_reason, retired_team, id')
    .eq('id', matchId)
    .maybeSingle();
  if (!match || match.match_end_reason !== 'retired' || !match.retired_team) return;

  const { data: mps } = await supabase
    .from('match_players')
    .select('player_id, team, pre_match_win_prob')
    .eq('match_id', matchId);
  const retiredTeam = match.retired_team as 'A' | 'B';
  for (const row of mps ?? []) {
    const r = row as { player_id: string; team: string; pre_match_win_prob: number | null };
    if (r.team !== retiredTeam) continue;
    if (r.pre_match_win_prob == null || r.pre_match_win_prob < 0.55) continue;

    const { data: hist } = await supabase
      .from('matches')
      .select('id, match_end_reason, retired_team')
      .order('created_at', { ascending: false })
      .limit(50);
    let retireWins = 0;
    let retireTotal = 0;
    for (const m of hist ?? []) {
      const hm = m as { id: string; match_end_reason: string; retired_team: string | null };
      if (hm.match_end_reason !== 'retired' || !hm.retired_team) continue;
      const { data: rmp } = await supabase
        .from('match_players')
        .select('team, pre_match_win_prob')
        .eq('match_id', hm.id)
        .eq('player_id', r.player_id)
        .maybeSingle();
      const mp = rmp as { team: string; pre_match_win_prob: number | null } | null;
      if (!mp || mp.team !== hm.retired_team) continue;
      retireTotal++;
      if ((mp.pre_match_win_prob ?? 0) >= 0.55) retireWins++;
    }
    if (retireTotal >= STRATEGIC_RETIREMENT_MIN_COUNT && retireWins / retireTotal >= STRATEGIC_RETIREMENT_MIN_RATE) {
      await upsertAlert('strategic_retirement', [r.player_id], [matchId], {
        rate: retireWins / retireTotal,
        sample: retireTotal,
      });
    }
  }
}

export async function runFraudCheck(matchId: string): Promise<void> {
  await Promise.allSettled([
    checkRepeatedResults(matchId),
    checkPredictionFailures(matchId),
    checkSandbagging(matchId),
    checkClosedGroupInflation(matchId),
    checkScoreManipulation(matchId),
    checkStrategicRetirement(matchId),
  ]);
}

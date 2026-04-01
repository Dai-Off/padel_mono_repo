import { rating, rate, predictWin } from 'openskill';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

export const COMEBACK_BONUS = 1.1;
export const WINDOW_SIZE = 20;
export const MIN_SAMPLES = 10;
export const DEFAULT_BETA = 4.167;

export type ScoreSet = { a: number; b: number };

export function calcEloRating(mu: number, sigma: number): number {
  const conservative = mu - 2 * sigma;
  const MIN_C = 0;
  const MAX_C = 50;
  const clamped = Math.max(MIN_C, Math.min(MAX_C, conservative));
  return Math.round((clamped / MAX_C) * 7 * 10) / 10;
}

export function calcScoreMargin(sets: ScoreSet[]): number {
  let totalA = 0;
  let totalB = 0;
  for (const s of sets) {
    totalA += s.a;
    totalB += s.b;
  }
  const total = totalA + totalB;
  if (total === 0) return 1.0;
  return 0.5 + Math.abs(totalA - totalB) / total;
}

export function detectComeback(
  sets: ScoreSet[],
  winnerTeam: 'A' | 'B',
  matchEndReason: 'completed' | 'retired' | 'timeout'
): boolean {
  if (matchEndReason !== 'completed' || sets.length < 2) return false;
  if (sets[0].a === sets[0].b) return false;
  const firstSetWinner = sets[0].a > sets[0].b ? 'A' : 'B';
  return firstSetWinner !== winnerTeam;
}

export function determineOutcome(
  sets: ScoreSet[],
  matchEndReason: 'completed' | 'retired' | 'timeout',
  retiredTeam?: 'A' | 'B' | null
): { ranks: [number, number]; winnerTeam: 'A' | 'B' | null } {
  if (matchEndReason === 'timeout') {
    return { ranks: [1, 1], winnerTeam: null };
  }
  if (matchEndReason === 'retired') {
    if (!retiredTeam) return { ranks: [1, 1], winnerTeam: null };
    const winner = retiredTeam === 'A' ? 'B' : 'A';
    return { ranks: retiredTeam === 'A' ? [2, 1] : [1, 2], winnerTeam: winner };
  }
  let setsWonA = 0;
  let setsWonB = 0;
  for (const s of sets) {
    if (s.a > s.b) setsWonA++;
    else if (s.b > s.a) setsWonB++;
  }
  if (setsWonA === setsWonB) {
    return { ranks: [1, 1], winnerTeam: null };
  }
  const winnerTeam = setsWonA > setsWonB ? 'A' : 'B';
  return { ranks: winnerTeam === 'A' ? [1, 2] : [2, 1], winnerTeam };
}

export function updateBeta(
  currentBeta: number,
  residuals: number[],
  newResidual: number
): { newBeta: number; updatedResiduals: number[] } {
  const updated = [...residuals, Math.abs(newResidual)];
  if (updated.length > WINDOW_SIZE) updated.shift();
  if (updated.length < MIN_SAMPLES) {
    return { newBeta: currentBeta, updatedResiduals: updated };
  }
  const mean = updated.reduce((a, b) => a + b, 0) / updated.length;
  const variance = updated.reduce((a, b) => a + (b - mean) ** 2, 0) / updated.length;
  const measuredStd = Math.sqrt(variance);
  const newBeta = 0.5 * measuredStd + 0.5 * DEFAULT_BETA;
  return { newBeta, updatedResiduals: updated };
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

function parseResiduals(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

type DbPlayer = {
  id: string;
  mu: number;
  sigma: number;
  beta: number;
  beta_residuals: unknown;
  elo_rating: number;
  matches_played_competitive: number;
  matches_played_matchmaking: number;
};

type DbMatchPlayer = {
  id: string;
  player_id: string;
  team: 'A' | 'B';
  players: DbPlayer | DbPlayer[] | null;
};

function teamSynergyDelta(winnerTeam: 'A' | 'B' | null, team: 'A' | 'B'): number {
  if (!winnerTeam) return 0;
  if (winnerTeam === team) return 0.1;
  return -0.1;
}

async function fetchSynergyRow(p1: string, p2: string): Promise<{ value: number; matches_count: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const [a, b] = p1 < p2 ? [p1, p2] : [p2, p1];
  const { data } = await supabase
    .from('player_synergies')
    .select('value, matches_count')
    .eq('player_id_1', a)
    .eq('player_id_2', b)
    .maybeSingle();
  return {
    value: (data?.value as number) ?? 0,
    matches_count: (data?.matches_count as number) ?? 0,
  };
}

export async function runLevelingPipeline(matchId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: match, error: errM } = await supabase
    .from('matches')
    .select(
      'id, competitive, score_status, type, sets, match_end_reason, retired_team, leveling_applied_at'
    )
    .eq('id', matchId)
    .maybeSingle();

  if (errM) throw new Error(errM.message);
  if (!match) throw new Error('Partido no encontrado');
  if (!match.competitive || match.score_status !== 'confirmed') return;
  if (match.leveling_applied_at) return;

  const { data: rows, error: errMp } = await supabase
    .from('match_players')
    .select(
      `id, player_id, team,
       players (id, mu, sigma, beta, beta_residuals, elo_rating, matches_played_competitive, matches_played_matchmaking)`
    )
    .eq('match_id', matchId);

  if (errMp) throw new Error(errMp.message);
  const mps = (rows ?? []) as unknown as DbMatchPlayer[];
  if (mps.length !== 4) throw new Error('Se requieren 4 jugadores para nivelación');

  const flatPlayers: DbPlayer[] = [];
  for (const mp of mps) {
    const p = Array.isArray(mp.players) ? mp.players[0] : mp.players;
    if (!p) throw new Error('Jugador no cargado');
    flatPlayers.push({
      id: p.id,
      mu: Number(p.mu),
      sigma: Number(p.sigma),
      beta: Number(p.beta),
      beta_residuals: p.beta_residuals,
      elo_rating: Number(p.elo_rating),
      matches_played_competitive: Number(p.matches_played_competitive),
      matches_played_matchmaking: Number(p.matches_played_matchmaking),
    });
  }

  const byTeam = { A: mps.filter((x) => x.team === 'A'), B: mps.filter((x) => x.team === 'B') };
  if (byTeam.A.length !== 2 || byTeam.B.length !== 2) throw new Error('Equipos inválidos');

  const sets = parseSets(match.sets);
  const endReason = (match.match_end_reason ?? 'completed') as 'completed' | 'retired' | 'timeout';
  const retiredTeam = (match.retired_team as 'A' | 'B' | null) ?? null;
  const { ranks, winnerTeam } = determineOutcome(sets, endReason, retiredTeam);

  const teamARatings = byTeam.A.map((mp) => {
    const pl = flatPlayers.find((p) => p.id === mp.player_id)!;
    return rating({ mu: pl.mu, sigma: pl.sigma }, { beta: pl.beta });
  });
  const teamBRatings = byTeam.B.map((mp) => {
    const pl = flatPlayers.find((p) => p.id === mp.player_id)!;
    return rating({ mu: pl.mu, sigma: pl.sigma }, { beta: pl.beta });
  });

  const winProbs = predictWin([teamARatings, teamBRatings]);
  const probA = winProbs[0] ?? 0.5;
  const probB = winProbs[1] ?? 0.5;

  const newTeams = rate([teamARatings, teamBRatings], { rank: ranks });

  const scoreMargin = calcScoreMargin(sets);
  const wTeam = winnerTeam ?? 'A';
  const comeback = winnerTeam ? detectComeback(sets, wTeam, endReason) : false;
  const marginFinal = comeback ? scoreMargin * COMEBACK_BONUS : scoreMargin;

  const playerUpdates: Record<
    string,
    {
      oldElo: number;
      newMu: number;
      newSigma: number;
      newBeta: number;
      newResiduals: number[];
      newElo: number;
      mpc: number;
      mpm: number;
      preProb: number;
      outcome: number;
      mpId: string;
      team: 'A' | 'B';
    }
  > = {};

  for (let ti = 0; ti < 2; ti++) {
    const teamMps = ti === 0 ? byTeam.A : byTeam.B;
    const newRs = newTeams[ti] ?? [];
    for (let i = 0; i < teamMps.length; i++) {
      const mp = teamMps[i];
      const pl = flatPlayers.find((p) => p.id === mp.player_id)!;
      const oldMu = pl.mu;
      const newR = newRs[i];
      if (!newR) throw new Error('OpenSkill sin rating');
      const rawDelta = newR.mu - oldMu;
      const finalMu = oldMu + rawDelta * marginFinal;
      const preProb = mp.team === 'A' ? probA : probB;
      let outcome = 0.5;
      if (winnerTeam === 'A' || winnerTeam === 'B') {
        outcome = mp.team === winnerTeam ? 1 : 0;
      }
      const residual = outcome - preProb;
      const oldResiduals = parseResiduals(pl.beta_residuals);
      const { newBeta, updatedResiduals } = updateBeta(pl.beta, oldResiduals, residual);
      const newElo = calcEloRating(finalMu, newR.sigma);
      const mpc = pl.matches_played_competitive + 1;
      const isMm = match.type === 'matchmaking';
      const mpm = pl.matches_played_matchmaking + (isMm ? 1 : 0);

      playerUpdates[pl.id] = {
        oldElo: pl.elo_rating,
        newMu: finalMu,
        newSigma: newR.sigma,
        newBeta,
        newResiduals: updatedResiduals,
        newElo,
        mpc,
        mpm,
        preProb,
        outcome,
        mpId: mp.id,
        team: mp.team,
      };
    }
  }

  const pAIds = byTeam.A.map((x) => x.player_id).sort();
  const pBIds = byTeam.B.map((x) => x.player_id).sort();
  const deltaA = teamSynergyDelta(winnerTeam, 'A');
  const deltaB = teamSynergyDelta(winnerTeam, 'B');

  const synergyPayload: {
    player_id_1: string;
    player_id_2: string;
    value: number;
    matches_count: number;
  }[] = [];

  async function addSynergyPair(id1: string, id2: string, delta: number) {
    const [a, b] = id1 < id2 ? [id1, id2] : [id2, id1];
    const cur = await fetchSynergyRow(a, b);
    const nextVal = cur.value + delta;
    const nextCount = cur.matches_count + 1;
    synergyPayload.push({
      player_id_1: a,
      player_id_2: b,
      value: nextVal,
      matches_count: nextCount,
    });
  }

  await addSynergyPair(pAIds[0], pAIds[1], deltaA);
  await addSynergyPair(pBIds[0], pBIds[1], deltaB);

  const pPlayerUpdates = Object.entries(playerUpdates).map(([id, u]) => ({
    id,
    mu: u.newMu,
    sigma: u.newSigma,
    beta: u.newBeta,
    beta_residuals: u.newResiduals,
    elo_rating: u.newElo,
    matches_played_competitive: u.mpc,
    matches_played_matchmaking: u.mpm,
  }));

  const pMatchPlayerUpdates = Object.values(playerUpdates).map((u) => {
    let result: 'win' | 'loss' | 'draw' = 'draw';
    if (winnerTeam === 'A' || winnerTeam === 'B') {
      result = u.team === winnerTeam ? 'win' : 'loss';
    }
    return {
      id: u.mpId,
      result,
      rating_change: u.newElo - u.oldElo,
      pre_match_win_prob: u.preProb,
    };
  });

  const { error: rpcErr } = await supabase.rpc('apply_leveling_pipeline', {
    p_match_id: matchId,
    p_player_updates: pPlayerUpdates,
    p_match_player_updates: pMatchPlayerUpdates,
    p_synergy_upserts: synergyPayload,
  });

  if (rpcErr) throw new Error(rpcErr.message);
}

export async function applyFriendlyPlayCounts(matchId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const { data: updated, error: uErr } = await supabase
    .from('matches')
    .update({ friendly_count_applied_at: now, updated_at: now })
    .eq('id', matchId)
    .eq('competitive', false)
    .eq('score_status', 'confirmed')
    .is('friendly_count_applied_at', null)
    .select('id')
    .maybeSingle();
  if (uErr) throw new Error(uErr.message);
  if (!updated) return;

  const { data: mps, error: e2 } = await supabase.from('match_players').select('player_id').eq('match_id', matchId);
  if (e2) throw new Error(e2.message);
  for (const row of mps ?? []) {
    const pid = (row as { player_id: string }).player_id;
    const { data: pl, error: e3 } = await supabase
      .from('players')
      .select('matches_played_friendly')
      .eq('id', pid)
      .maybeSingle();
    if (e3) throw new Error(e3.message);
    const cur = Number((pl as { matches_played_friendly?: number } | null)?.matches_played_friendly ?? 0);
    const { error: e4 } = await supabase
      .from('players')
      .update({ matches_played_friendly: cur + 1, updated_at: now })
      .eq('id', pid);
    if (e4) throw new Error(e4.message);
  }
}

import { rating, predictWin } from 'openskill';
import { haversineKm } from '../lib/haversine';
import { leaguesMatchmakingCompatible } from './matchmakingLeague';

export const MAX_LEVEL_SPREAD = 1.0;
export const BASE_WIN_PROB_MIN = 0.35;
export const BASE_WIN_PROB_MAX = 0.65;
export const STREAK_THRESHOLD = 4;

export type PoolRow = {
  id: string;
  player_id: string;
  paired_with_id: string | null;
  club_id: string | null;
  max_distance_km: number | null;
  preferred_side: string | null;
  gender: string;
  available_from: string;
  available_until: string;
  expires_at?: string | null;
  search_lat?: number | null;
  search_lng?: number | null;
  created_at?: string;
};

export type SkillRow = { mu: number; sigma: number; beta: number };

const GENDER_PREF_OK: Record<string, Record<string, boolean>> = {
  male: { male: true, female: false, mixed: false, any: true },
  female: { male: false, female: true, mixed: false, any: true },
  mixed: { male: false, female: false, mixed: true, any: true },
  any: { male: true, female: true, mixed: true, any: true },
};

export function genderPrefsPairwiseOk(prefs: string[]): boolean {
  for (let i = 0; i < prefs.length; i++) {
    for (let j = i + 1; j < prefs.length; j++) {
      const a = prefs[i] || 'any';
      const b = prefs[j] || 'any';
      if (!GENDER_PREF_OK[a]?.[b]) return false;
    }
  }
  return true;
}

export function eloWindowFromRecent(playerElo: number, recent: ('win' | 'loss')[]): { min: number; max: number } {
  const last = recent.slice(0, STREAK_THRESHOLD);
  const allWins = last.length === STREAK_THRESHOLD && last.every((r) => r === 'win');
  const allLoss = last.length === STREAK_THRESHOLD && last.every((r) => r === 'loss');
  if (allWins) return { min: playerElo - 0.2, max: playerElo + 0.8 };
  if (allLoss) return { min: playerElo - 0.8, max: playerElo + 0.2 };
  return { min: playerElo - 0.5, max: playerElo + 0.5 };
}

export function groupSatisfiesEloWindows(
  ids: string[],
  eloById: Map<string, number>,
  recentById: Map<string, ('win' | 'loss')[]>,
): boolean {
  for (const id of ids) {
    const elo = eloById.get(id);
    if (elo == null) return false;
    const w = eloWindowFromRecent(elo, recentById.get(id) ?? []);
    for (const other of ids) {
      if (other === id) continue;
      const e2 = eloById.get(other);
      if (e2 == null) return false;
      if (e2 < w.min || e2 > w.max) return false;
    }
  }
  return true;
}

export function validateBiologicalRules(
  prefs: string[],
  sexById: Map<string, string | null>,
  teamA: string[],
  teamB: string[],
): boolean {
  if (prefs.some((p) => p === 'male')) {
    if (![...sexById.values()].every((s) => s === 'male')) return false;
  }
  if (prefs.some((p) => p === 'female')) {
    if (![...sexById.values()].every((s) => s === 'female')) return false;
  }
  if (prefs.some((p) => p === 'mixed')) {
    const sexes = [...sexById.values()];
    if (sexes.some((s) => !s)) return false;
    const m = sexes.filter((s) => s === 'male').length;
    const f = sexes.filter((s) => s === 'female').length;
    if (m !== 2 || f !== 2) return false;
    const countMF = (team: string[]) => {
      let mm = 0;
      let ff = 0;
      for (const id of team) {
        const s = sexById.get(id);
        if (s === 'male') mm++;
        else if (s === 'female') ff++;
      }
      return mm === 1 && ff === 1;
    };
    if (!countMF(teamA) || !countMF(teamB)) return false;
  }
  return true;
}

export function exceedsLevelSpread(elos: number[]): boolean {
  if (!elos.length) return true;
  const mn = Math.min(...elos);
  const mx = Math.max(...elos);
  return mx - mn > MAX_LEVEL_SPREAD;
}

function synergyMuDelta(pairSynergy: number): number {
  return Math.tanh(pairSynergy / 5.5) * 0.5;
}

function ratingsForPair(
  pair: [string, string],
  skillsById: Map<string, SkillRow>,
  synergy: number,
): ReturnType<typeof rating>[] {
  const boost = synergyMuDelta(synergy) / 2;
  return pair.map((id) => {
    const sk = skillsById.get(id);
    if (!sk) return rating({ mu: 25 + boost, sigma: 8.333 }, { beta: 4.167 });
    return rating({ mu: sk.mu + boost, sigma: sk.sigma }, { beta: sk.beta });
  });
}

export function pairSynergyValue(synergyMap: Map<string, number>, a: string, b: string): number {
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  return synergyMap.get(key) ?? 0;
}

export function bestTeamSplitSync(
  ids: string[],
  fixedPairs: [string, string][],
  skillsById: Map<string, SkillRow>,
  synergyMap: Map<string, number>,
): { teamA: string[]; teamB: string[]; winProb: number; score: number } | null {
  if (ids.length !== 4) return null;

  const candidates: { a: string[]; b: string[] }[] = [];
  if (fixedPairs.length === 2) {
    candidates.push({ a: [...fixedPairs[0]], b: [...fixedPairs[1]] });
  } else if (fixedPairs.length === 1) {
    const [p1, p2] = fixedPairs[0];
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
    const s1 = pairSynergyValue(synergyMap, c.a[0], c.a[1]);
    const s2 = pairSynergyValue(synergyMap, c.b[0], c.b[1]);
    const ra = ratingsForPair([c.a[0], c.a[1]], skillsById, s1);
    const rb = ratingsForPair([c.b[0], c.b[1]], skillsById, s2);
    const probs = predictWin([ra, rb]);
    const pA = probs[0] ?? 0.5;
    if (pA < BASE_WIN_PROB_MIN || pA > BASE_WIN_PROB_MAX) continue;
    const balanceScore = 1 - Math.abs(0.5 - pA) * 2;
    if (!best || balanceScore > best.score) {
      best = { teamA: c.a, teamB: c.b, winProb: pA, score: balanceScore };
    }
  }

  return best;
}

export function allPlayersWithinMaxDistance(
  flatRows: PoolRow[],
  matchClubId: string,
  clubPosById: Map<string, { lat: number; lng: number }>,
): boolean {
  const clubPos = clubPosById.get(matchClubId);
  for (const r of flatRows) {
    if (r.max_distance_km == null) continue;
    const lat = r.search_lat;
    const lng = r.search_lng;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return false;
    }
    if (!clubPos) continue;
    const km = haversineKm(lat, lng, clubPos.lat, clubPos.lng);
    if (km > r.max_distance_km) return false;
  }
  return true;
}

export function overlap(aFrom: string, aUntil: string, bFrom: string, bUntil: string): boolean {
  const af = new Date(aFrom).getTime();
  const au = new Date(aUntil).getTime();
  const bf = new Date(bFrom).getTime();
  const bu = new Date(bUntil).getTime();
  return af < bu && bf < au;
}

export function intersectRange(entries: PoolRow[]): { start: string; end: string } | null {
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

export function resolveClubId(allRows: PoolRow[]): string | null {
  const clubs = new Set<string>();
  for (const r of allRows) {
    if (r.club_id) clubs.add(r.club_id);
  }
  if (clubs.size !== 1) return null;
  return [...clubs][0];
}

export function buildUnits(rows: PoolRow[]): { players: string[]; rows: PoolRow[] }[] {
  const ids = new Set(rows.map((r) => r.player_id));
  const byId = new Map(rows.map((r) => [r.player_id, r]));
  const consumed = new Set<string>();
  const units: { players: string[]; rows: PoolRow[] }[] = [];

  for (const r of rows) {
    if (consumed.has(r.player_id)) continue;
    if (r.paired_with_id && ids.has(r.paired_with_id)) {
      const buddy = byId.get(r.paired_with_id);
      if (!buddy) continue;
      consumed.add(r.player_id);
      consumed.add(r.paired_with_id);
      const pair = [r, buddy].sort((a, b) => a.player_id.localeCompare(b.player_id));
      units.push({ players: pair.map((p) => p.player_id), rows: pair });
    } else if (r.paired_with_id) {
      continue;
    } else {
      consumed.add(r.player_id);
      units.push({ players: [r.player_id], rows: [r] });
    }
  }
  return units;
}

export function* iterUnitCombos(
  units: { players: string[]; rows: PoolRow[] }[],
  need: number,
  start: number,
  picked: { players: string[]; rows: PoolRow[] }[],
): Generator<{ players: string[]; rows: PoolRow[] }[]> {
  if (need === 0) {
    yield picked;
    return;
  }
  if (need < 0) return;
  for (let i = start; i < units.length; i++) {
    const u = units[i];
    if (u.players.length > need) continue;
    yield* iterUnitCombos(units, need - u.players.length, i + 1, [...picked, u]);
  }
}

export function fixedPairsFromRows(flatRows: PoolRow[]): [string, string][] {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  const byId = new Map(flatRows.map((r) => [r.player_id, r]));
  for (const r of flatRows) {
    if (!r.paired_with_id) continue;
    const buddy = byId.get(r.paired_with_id);
    if (!buddy) continue;
    const a = r.player_id;
    const b = r.paired_with_id;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a < b ? [a, b] : [b, a]);
  }
  return out;
}

export type QuartetPreCourtContext = {
  clubPosById: Map<string, { lat: number; lng: number }>;
  eloById: Map<string, number>;
  recentById: Map<string, ('win' | 'loss')[]>;
  sexById: Map<string, string | null>;
  skillsById: Map<string, SkillRow>;
  synergyMap: Map<string, number>;
  ligaById: Map<string, string>;
};

/** Valida cuarteto sin comprobar pista (matchmaking + §6.1). */
export function quartetPreCourtValid(
  flatRows: PoolRow[],
  ids: string[],
  clubId: string,
  ctx: QuartetPreCourtContext,
): { split: { teamA: string[]; teamB: string[]; winProb: number; score: number } } | null {
  if (ids.length !== 4) return null;
  const prefs = flatRows.map((r) => r.gender || 'any');
  if (!genderPrefsPairwiseOk(prefs)) return null;
  if (!flatRows.every((r) => flatRows.every((o) => overlap(r.available_from, r.available_until, o.available_from, o.available_until))))
    return null;
  if (resolveClubId(flatRows) !== clubId) return null;
  if (!leaguesMatchmakingCompatible(ids, ctx.ligaById)) return null;
  if (!allPlayersWithinMaxDistance(flatRows, clubId, ctx.clubPosById)) return null;
  const slot = intersectRange(flatRows);
  if (!slot) return null;
  const elos = ids.map((id) => ctx.eloById.get(id)).filter((x): x is number => x != null);
  if (elos.length !== 4 || exceedsLevelSpread(elos)) return null;
  if (!groupSatisfiesEloWindows(ids, ctx.eloById, ctx.recentById)) return null;
  const fixedPairs = fixedPairsFromRows(flatRows);
  const split = bestTeamSplitSync(ids, fixedPairs, ctx.skillsById, ctx.synergyMap);
  if (!split) return null;
  const sexMap = new Map(ids.map((id) => [id, ctx.sexById.get(id) ?? null] as const));
  if (!validateBiologicalRules(prefs, sexMap, split.teamA, split.teamB)) return null;
  return { split };
}

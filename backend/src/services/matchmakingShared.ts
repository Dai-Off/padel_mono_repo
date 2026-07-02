import { rating, predictWin } from 'openskill';
import { haversineKm } from '../lib/haversine';
import { leaguesMatchmakingCompatible } from './matchmakingLeague';

export const MAX_LEVEL_SPREAD = 1.0;
export const BASE_WIN_PROB_MIN = 0.35;
export const BASE_WIN_PROB_MAX = 0.65;
export const STREAK_THRESHOLD = 4;
/** Pareja premade: diferencia real de elo máxima para invitar (0-7). */
export const PREMADE_MAX_GAP = 1.5;
/** Pareja premade: al débil se le trata como `fuerte − este valor` para emparejar. */
export const PREMADE_FLOOR_GAP = 1.0;

export type PoolRow = {
  id: string;
  player_id: string;
  paired_with_id: string | null;
  club_id: string | null;
  preferred_club_ids?: string[] | null;
  max_distance_km: number | null;
  preferred_side: string | null;
  gender: string;
  available_from: string;
  available_until: string;
  /** Franjas de disponibilidad disjuntas (una o varias por día). Fuente de verdad del horario. */
  availability_slots?: { start_at: string; end_at: string }[] | null;
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
  premadeIds?: Set<string>,
): boolean {
  for (const id of ids) {
    // Los miembros de una pareja premade quedan acotados por exceedsLevelSpread
    // (sobre elo efectivo) + balance de win prob, no por estas ventanas ±0.5.
    if (premadeIds?.has(id)) continue;
    const elo = eloById.get(id);
    if (elo == null) return false;
    const w = eloWindowFromRecent(elo, recentById.get(id) ?? []);
    for (const other of ids) {
      if (other === id) continue;
      if (premadeIds?.has(other)) continue;
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

/** Duración fija de un partido de matchmaking (90 min). */
export const MATCH_DURATION_MS = 90 * 60 * 1000;
/** Los clubs solo abren slots en punto o y media; el motor busca en pasos de 30 min alineados a :00/:30. */
export const SLOT_STEP_MS = 30 * 60 * 1000;

export type AvailabilitySlot = { start_at: string; end_at: string };
export type MsInterval = { start: number; end: number };

/** Une intervalos solapados o contiguos y los devuelve ordenados. */
function mergeIntervals(intervals: MsInterval[]): MsInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: MsInterval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

/** Franjas de disponibilidad de una fila, en ms. Cae al rango único legado si no hay slots. */
export function rowSlots(row: Pick<PoolRow, 'availability_slots' | 'available_from' | 'available_until'>): MsInterval[] {
  const raw = row.availability_slots;
  if (Array.isArray(raw) && raw.length > 0) {
    const out: MsInterval[] = [];
    for (const s of raw) {
      const start = new Date(s.start_at).getTime();
      const end = new Date(s.end_at).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && start < end) out.push({ start, end });
    }
    if (out.length > 0) return mergeIntervals(out);
  }
  const f = new Date(row.available_from).getTime();
  const u = new Date(row.available_until).getTime();
  if (Number.isFinite(f) && Number.isFinite(u) && f < u) return [{ start: f, end: u }];
  return [];
}

/** Intersección de las franjas de todos los jugadores: intervalos comunes a los 4. */
export function intersectSlots(rows: PoolRow[]): MsInterval[] {
  if (rows.length === 0) return [];
  let acc = rowSlots(rows[0]!);
  for (let i = 1; i < rows.length; i++) {
    const next = rowSlots(rows[i]!);
    const merged: MsInterval[] = [];
    for (const a of acc) {
      for (const b of next) {
        const start = Math.max(a.start, b.start);
        const end = Math.min(a.end, b.end);
        if (start < end) merged.push({ start, end });
      }
    }
    acc = mergeIntervals(merged);
    if (acc.length === 0) return [];
  }
  return acc;
}

/** ¿Existe una ventana común a los 4 jugadores que aloje un partido completo (90 min)? */
export function hasMatchWindow(rows: PoolRow[]): boolean {
  return intersectSlots(rows).some((iv) => iv.end - iv.start >= MATCH_DURATION_MS);
}

/** Máximo de franjas que un jugador puede enviar (varios días × varios tramos). */
const MAX_AVAILABILITY_SLOTS = 30;

/**
 * Valida y normaliza `availability_slots` del body. Reglas:
 * - array no vacío de `{ start_at, end_at }` ISO;
 * - bordes alineados a :00/:30 (rejilla de slots de club);
 * - cada franja dura ≥ 90 min (si no, no cabe partido);
 * - al menos una franja futura.
 * Devuelve las franjas fusionadas (solapes/contiguas) y los derivados `from`/`until` (min/max).
 */
export function parseAvailabilitySlots(
  input: unknown,
): { ok: true; slots: AvailabilitySlot[]; from: string; until: string } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'availability_slots debe ser un array no vacío de franjas { start_at, end_at }' };
  }
  if (input.length > MAX_AVAILABILITY_SLOTS) {
    return { ok: false, error: `Demasiadas franjas de disponibilidad (máx ${MAX_AVAILABILITY_SLOTS})` };
  }
  const intervals: MsInterval[] = [];
  for (const raw of input) {
    const s = raw as { start_at?: unknown; end_at?: unknown } | null;
    const startStr = s && typeof s.start_at === 'string' ? s.start_at : null;
    const endStr = s && typeof s.end_at === 'string' ? s.end_at : null;
    if (!startStr || !endStr) return { ok: false, error: 'Cada franja necesita start_at y end_at (ISO)' };
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, error: 'start_at/end_at inválidos' };
    if (start % SLOT_STEP_MS !== 0 || end % SLOT_STEP_MS !== 0) {
      return { ok: false, error: 'Las franjas deben empezar y terminar en punto o y media (:00 / :30)' };
    }
    if (end - start < MATCH_DURATION_MS) {
      return { ok: false, error: 'Cada franja debe durar al menos 90 min (3 slots de media hora)' };
    }
    intervals.push({ start, end });
  }
  const merged = mergeIntervals(intervals);
  const maxEnd = Math.max(...merged.map((i) => i.end));
  if (maxEnd <= Date.now()) return { ok: false, error: 'La disponibilidad debe incluir alguna franja futura' };
  const slots = merged.map((i) => ({ start_at: new Date(i.start).toISOString(), end_at: new Date(i.end).toISOString() }));
  return {
    ok: true,
    slots,
    from: new Date(Math.min(...merged.map((i) => i.start))).toISOString(),
    until: new Date(maxEnd).toISOString(),
  };
}

export function resolveClubId(allRows: PoolRow[]): string | null {
  const clubs = new Set<string>();
  for (const r of allRows) {
    if (r.club_id) clubs.add(r.club_id);
  }
  if (clubs.size !== 1) return null;
  return [...clubs][0];
}

function rowPreferredClubIds(r: PoolRow): string[] {
  if (r.club_id) return [r.club_id];
  const prefs = r.preferred_club_ids;
  if (Array.isArray(prefs) && prefs.length > 0) return prefs;
  return [];
}

/** Jugadores sin restricción aceptan cualquier sede compatible; los restringidos deben incluir el club. */
export function clubPreferenceCompatible(allRows: PoolRow[], clubId: string): boolean {
  for (const r of allRows) {
    if (r.club_id != null && r.club_id !== clubId) return false;
    const prefs = r.preferred_club_ids;
    if (Array.isArray(prefs) && prefs.length > 0 && !prefs.includes(clubId)) return false;
  }
  return true;
}

/** Sedes candidatas: intersección de listas preferidas o, si nadie restringe, las que cumplen distancia. */
export function resolveCandidateClubIds(
  allRows: PoolRow[],
  clubPosById: Map<string, { lat: number; lng: number }>,
): string[] {
  const fixed = resolveClubId(allRows);
  if (fixed) {
    if (!clubPreferenceCompatible(allRows, fixed)) return [];
    return [fixed];
  }

  let intersection: Set<string> | null = null;
  for (const r of allRows) {
    const allowed = rowPreferredClubIds(r);
    if (allowed.length === 0) continue;
    const set = new Set(allowed);
    if (intersection === null) {
      intersection = set;
    } else {
      const next = new Set<string>();
      for (const id of intersection) {
        if (set.has(id)) next.add(id);
      }
      intersection = next;
    }
    if (intersection.size === 0) return [];
  }

  const candidateIds =
    intersection === null ? [...clubPosById.keys()] : [...intersection];

  const out: string[] = [];
  for (const clubId of candidateIds) {
    if (!clubPreferenceCompatible(allRows, clubId)) continue;
    if (allPlayersWithinMaxDistance(allRows, clubId, clubPosById)) out.push(clubId);
  }
  return out;
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
  /** Miembros de una pareja premade: exentos del filtro de ventanas de elo. */
  premadeIds?: Set<string>;
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
  // Debe existir una ventana común a los 4 que aloje un partido de 90 min (franjas disjuntas soportadas).
  if (!hasMatchWindow(flatRows)) return null;
  if (!clubPreferenceCompatible(flatRows, clubId)) return null;
  if (!leaguesMatchmakingCompatible(ids, ctx.ligaById)) return null;
  if (!allPlayersWithinMaxDistance(flatRows, clubId, ctx.clubPosById)) return null;
  const elos = ids.map((id) => ctx.eloById.get(id)).filter((x): x is number => x != null);
  if (elos.length !== 4 || exceedsLevelSpread(elos)) return null;
  if (!groupSatisfiesEloWindows(ids, ctx.eloById, ctx.recentById, ctx.premadeIds)) return null;
  const fixedPairs = fixedPairsFromRows(flatRows);
  const split = bestTeamSplitSync(ids, fixedPairs, ctx.skillsById, ctx.synergyMap);
  if (!split) return null;
  const sexMap = new Map(ids.map((id) => [id, ctx.sexById.get(id) ?? null] as const));
  if (!validateBiologicalRules(prefs, sexMap, split.teamA, split.teamB)) return null;
  return { split };
}

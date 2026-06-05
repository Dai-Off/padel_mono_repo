export const ELO_LEVEL_MIN = 0;
export const ELO_LEVEL_MAX = 7;
export const ELO_LEVEL_STEP = 0.5;

export type OpenMatchType = 'open' | 'matchmaking';

export function normalizeMatchType(bodyType?: string | null): OpenMatchType {
  return bodyType === 'matchmaking' ? 'matchmaking' : 'open';
}

/** Solo matchmaking 2v2 puede ser competitivo (afecta ELO/LP). */
export function resolveCompetitiveForCreate(
  type: OpenMatchType,
  competitive?: boolean | null,
): boolean {
  if (type === 'matchmaking') return competitive !== false;
  return false;
}

export function matchAffectsElo(competitive: boolean, type: string | null | undefined): boolean {
  return competitive && type === 'matchmaking';
}

export function parseEloLevel(raw: unknown): number | null {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const snapped = Math.round(n / ELO_LEVEL_STEP) * ELO_LEVEL_STEP;
  return Math.round(snapped * 10) / 10;
}

export type ParsedEloRange =
  | { ok: true; elo_min: number | null; elo_max: number | null }
  | { ok: false; error: string };

export function parseEloRange(eloMinRaw: unknown, eloMaxRaw: unknown): ParsedEloRange {
  const hasMin = eloMinRaw !== undefined && eloMinRaw !== null && eloMinRaw !== '';
  const hasMax = eloMaxRaw !== undefined && eloMaxRaw !== null && eloMaxRaw !== '';
  const elo_min = hasMin ? parseEloLevel(eloMinRaw) : null;
  const elo_max = hasMax ? parseEloLevel(eloMaxRaw) : null;

  if (hasMin && elo_min == null) {
    return { ok: false, error: 'elo_min inválido' };
  }
  if (hasMax && elo_max == null) {
    return { ok: false, error: 'elo_max inválido' };
  }
  if (elo_min != null && (elo_min < ELO_LEVEL_MIN || elo_min > ELO_LEVEL_MAX)) {
    return { ok: false, error: `elo_min debe estar entre ${ELO_LEVEL_MIN} y ${ELO_LEVEL_MAX}` };
  }
  if (elo_max != null && (elo_max < ELO_LEVEL_MIN || elo_max > ELO_LEVEL_MAX)) {
    return { ok: false, error: `elo_max debe estar entre ${ELO_LEVEL_MIN} y ${ELO_LEVEL_MAX}` };
  }
  if (elo_min != null && elo_max != null && elo_min > elo_max) {
    return { ok: false, error: 'elo_min no puede ser mayor que elo_max' };
  }
  return { ok: true, elo_min, elo_max };
}

export function defaultFriendlyEloRange(organizerElo: number): { elo_min: number; elo_max: number } {
  const elo = Number.isFinite(organizerElo) ? organizerElo : 3.5;
  const elo_min = Math.max(ELO_LEVEL_MIN, Math.round((elo - 1) / ELO_LEVEL_STEP) * ELO_LEVEL_STEP);
  const elo_max = Math.min(ELO_LEVEL_MAX, Math.round((elo + 1) / ELO_LEVEL_STEP) * ELO_LEVEL_STEP);
  return {
    elo_min: Math.round(elo_min * 10) / 10,
    elo_max: Math.round(elo_max * 10) / 10,
  };
}

type TeamRow = {
  id: string;
  name: string;
  sort_order: number;
  division_id: string;
};

type DivisionRow = {
  id: string;
  season_id: string;
  sort_order: number;
  promote_count: number;
  relegate_count: number;
};

export type PlannedMovement = {
  team_id: string;
  from_division_id: string;
  to_division_id: string;
  reason: 'promoted' | 'relegated';
};

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export function planPromotionRelegation(divisions: DivisionRow[], teams: TeamRow[]): PlannedMovement[] {
  const sortedDivs = [...divisions].sort((a, b) => n(a.sort_order) - n(b.sort_order));
  const byDivision = new Map<string, TeamRow[]>();
  for (const t of teams) {
    const list = byDivision.get(t.division_id) ?? [];
    list.push(t);
    byDivision.set(t.division_id, list);
  }
  for (const [k, list] of byDivision.entries()) {
    byDivision.set(k, [...list].sort((a, b) => n(a.sort_order) - n(b.sort_order)));
  }

  const planned: PlannedMovement[] = [];

  for (let i = 0; i < sortedDivs.length; i++) {
    const current = sortedDivs[i];
    const above = i > 0 ? sortedDivs[i - 1] : null;
    const below = i < sortedDivs.length - 1 ? sortedDivs[i + 1] : null;
    const currentTeams = byDivision.get(current.id) ?? [];

    const promotedIds = new Set<string>();

    if (above && n(current.promote_count) > 0) {
      const promoteCount = Math.min(n(current.promote_count), currentTeams.length);
      const toPromote = currentTeams.slice(0, promoteCount);
      for (const team of toPromote) {
        promotedIds.add(team.id);
        planned.push({
          team_id: team.id,
          from_division_id: current.id,
          to_division_id: above.id,
          reason: 'promoted',
        });
      }
    }

    if (below && n(current.relegate_count) > 0) {
      const eligibleForRelegation = currentTeams.filter((t) => !promotedIds.has(t.id));
      const relegateCount = Math.min(n(current.relegate_count), eligibleForRelegation.length);
      const toRelegate = eligibleForRelegation.slice(Math.max(0, eligibleForRelegation.length - relegateCount));
      for (const team of toRelegate) {
        planned.push({
          team_id: team.id,
          from_division_id: current.id,
          to_division_id: below.id,
          reason: 'relegated',
        });
      }
    }
  }

  return planned;
}

import type { PartidoItem } from '../screens/PartidosScreen';

export type ActivityOutcomeFilter = 'all' | 'won' | 'lost' | 'incomplete' | 'cancelled';

export type PartidoOutcome = 'won' | 'lost' | 'draw' | 'incomplete' | 'cancelled';

const OUTCOME_LABELS: Record<PartidoOutcome, string> = {
  won: 'Ganado',
  lost: 'Perdido',
  draw: 'Empate',
  incomplete: 'Sin resultado',
  cancelled: 'Cancelado',
};

export function outcomeLabel(outcome: PartidoOutcome): string {
  return OUTCOME_LABELS[outcome];
}

export function outcomeColor(outcome: PartidoOutcome): string {
  switch (outcome) {
    case 'won':
      return '#34D399';
    case 'lost':
      return '#F87171';
    case 'draw':
      return '#94A3B8';
    case 'cancelled':
      return '#9CA3AF';
    default:
      return '#FBBF24';
  }
}

function isCancelled(partido: PartidoItem): boolean {
  const ms = (partido.matchStatus ?? '').toLowerCase();
  const bs = (partido.bookingStatus ?? '').toLowerCase();
  return ms === 'cancelled' || bs === 'cancelled';
}

function hasRecordedScore(partido: PartidoItem): boolean {
  return Array.isArray(partido.sets) && partido.sets.length > 0;
}

function outcomeFromSets(partido: PartidoItem): PartidoOutcome | null {
  if (!hasRecordedScore(partido) || !partido.myTeam) return null;
  let us = 0;
  let them = 0;
  for (const s of partido.sets!) {
    const my = partido.myTeam === 'A' ? s.a : s.b;
    const opp = partido.myTeam === 'A' ? s.b : s.a;
    if (my > opp) us++;
    else if (opp > my) them++;
  }
  if (us === them) return 'draw';
  return us > them ? 'won' : 'lost';
}

export function classifyPartidoOutcome(partido: PartidoItem): PartidoOutcome {
  if (isCancelled(partido)) return 'cancelled';

  const result = partido.myResult;
  if (result === 'win') return 'won';
  if (result === 'loss') return 'lost';
  if (result === 'draw') return 'draw';

  const fromSets = outcomeFromSets(partido);
  if (fromSets) return fromSets;

  const scoreSt = (partido.scoreStatus ?? '').toLowerCase();
  if (scoreSt === 'confirmed' || scoreSt === 'pending_confirmation' || scoreSt === 'disputed' || scoreSt === 'pending_votes') {
    if (hasRecordedScore(partido)) return 'incomplete';
  }

  if (partido.matchPhase === 'past') return 'incomplete';
  return 'incomplete';
}

export function matchesActivityFilter(
  partido: PartidoItem,
  filter: ActivityOutcomeFilter,
): boolean {
  if (filter === 'all') return true;
  const outcome = classifyPartidoOutcome(partido);
  if (filter === 'won') return outcome === 'won';
  if (filter === 'lost') return outcome === 'lost';
  if (filter === 'cancelled') return outcome === 'cancelled';
  if (filter === 'incomplete') return outcome === 'incomplete' || outcome === 'draw';
  return true;
}

export function formatSetsScore(
  sets: Array<{ a: number; b: number }>,
  myTeam: 'A' | 'B' | null | undefined,
): string {
  return sets
    .map((s) => {
      if (myTeam === 'B') return `${s.b}-${s.a}`;
      return `${s.a}-${s.b}`;
    })
    .join(' · ');
}

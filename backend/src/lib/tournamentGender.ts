export type TournamentGender = 'male' | 'female' | 'mixed';

/** null = sin restricción por género. false = valor inválido (400). */
export function tournamentGenderFromBody(raw: unknown): TournamentGender | null | false {
  if (raw === undefined || raw === null || raw === '') return null;
  const g = String(raw).toLowerCase();
  if (g === 'male' || g === 'female' || g === 'mixed') return g;
  return false;
}

export function playerMeetsTournamentGender(
  tournamentGender: string | null | undefined,
  playerGender: string | null | undefined
): boolean {
  if (tournamentGender == null || tournamentGender === '') return true;
  const tg = String(tournamentGender).toLowerCase();
  if (tg === 'mixed') return true;
  const pg = String(playerGender ?? 'any').toLowerCase();
  if (tg === 'male') return pg === 'male';
  if (tg === 'female') return pg === 'female';
  return true;
}

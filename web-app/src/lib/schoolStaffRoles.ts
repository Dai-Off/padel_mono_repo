export function isSchoolCoachRole(role: string | null | undefined): boolean {
  const r = String(role ?? '').trim().toLowerCase();
  return /entrenador|entrenadora|coach|trainer/.test(r);
}

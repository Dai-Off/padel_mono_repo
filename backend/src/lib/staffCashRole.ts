export function staffRoleAllowsCashLedger(role: string | null | undefined): boolean {
  const r = String(role ?? '').trim().toLowerCase();
  return !/entrenador|entrenadora|coach|trainer|profesor/.test(r);
}

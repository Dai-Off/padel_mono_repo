const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export function normalizeUsernameInput(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsernameLocal(raw: string): string | null {
  const v = normalizeUsernameInput(raw);
  if (!v) return 'El usuario es obligatorio';
  if (v.includes('@')) return 'No puede contener @';
  if (!USERNAME_RE.test(v)) {
    return '3–30 caracteres: letras minúsculas, números o _';
  }
  return null;
}

export function formatPlayerLabel(
  player: {
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null | undefined,
): string {
  if (!player) return 'Jugador';
  const un = player.username?.trim();
  if (un) return `@${un}`;
  const fn = player.first_name ?? player.firstName ?? '';
  const ln = player.last_name ?? player.lastName ?? '';
  const name = `${fn} ${ln}`.trim();
  return name || 'Jugador';
}

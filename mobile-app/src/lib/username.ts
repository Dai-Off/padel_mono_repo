const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export function normalizeUsernameInput(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Valida el username en local. Devuelve una clave i18n (para pasar por t()) o null si es válido. */
export function validateUsernameLocal(raw: string): string | null {
  const v = normalizeUsernameInput(raw);
  if (!v) return 'common.usernameRequired';
  if (v.includes('@')) return 'common.usernameNoAt';
  if (!USERNAME_RE.test(v)) {
    return 'common.usernameFormat';
  }
  return null;
}

/** Etiqueta visible de un jugador. `fallback` debe venir ya traducido (t('common.playerFallback')). */
export function formatPlayerLabel(
  player: {
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null | undefined,
  fallback = 'Jugador',
): string {
  if (!player) return fallback;
  const un = player.username?.trim();
  if (un) return `@${un}`;
  const fn = player.first_name ?? player.firstName ?? '';
  const ln = player.last_name ?? player.lastName ?? '';
  const name = `${fn} ${ln}`.trim();
  return name || fallback;
}

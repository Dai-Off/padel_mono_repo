export function getFrontendUrl(): string {
  const url = process.env.FRONTEND_URL?.trim();
  if (url) return url.replace(/\/$/, '');
  return 'http://localhost:5173';
}

export function getBackendPublicUrl(): string {
  const explicit = process.env.BACKEND_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const port = process.env.PORT?.trim() || '3000';
  return `http://localhost:${port}`;
}

/**
 * URL a la que Supabase redirige tras validar el enlace de recovery.
 * Web y móvil usan la misma pantalla: {FRONTEND_URL}/reset-password
 * Debe estar en Supabase → Authentication → Redirect URLs.
 */
export function getPasswordResetRedirectUrl(): string {
  const explicit = process.env.PASSWORD_RESET_REDIRECT_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const legacyWeb = process.env.WEB_PASSWORD_RESET_REDIRECT_URL?.trim();
  if (legacyWeb) return legacyWeb.replace(/\/$/, '');
  const legacyMobile = process.env.MOBILE_PASSWORD_RESET_REDIRECT_URL?.trim();
  if (legacyMobile) return legacyMobile.replace(/\/$/, '');
  return `${getFrontendUrl()}/reset-password`;
}

/** @deprecated Usar getPasswordResetRedirectUrl */
export function getWebPasswordResetRedirectUrl(): string {
  return getPasswordResetRedirectUrl();
}

/** @deprecated Usar getPasswordResetRedirectUrl */
export function getMobilePasswordResetRedirectUrl(): string {
  return getPasswordResetRedirectUrl();
}

export function getTournamentInviteBaseUrl(): string {
  const explicit = process.env.TOURNAMENT_INVITE_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const backendPublic = process.env.BACKEND_PUBLIC_URL?.trim();
  if (backendPublic) return backendPublic.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export function buildTournamentInviteUrl(tournamentId: string, token: string): string {
  const base = getTournamentInviteBaseUrl();
  return `${base}/tournaments/invites/${encodeURIComponent(token)}/accept?tournament_id=${encodeURIComponent(tournamentId)}`;
}

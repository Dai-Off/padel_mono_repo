export function getFrontendUrl(): string {
  const url = process.env.FRONTEND_URL?.trim();
  if (url) return url.replace(/\/$/, '');
  return 'http://localhost:5173';
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

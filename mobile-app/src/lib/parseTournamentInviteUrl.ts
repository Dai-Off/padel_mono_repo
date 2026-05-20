export type ParsedTournamentInvite = {
  token: string;
  tournamentId: string;
};

/** Deep link: padelapp://tournament-invite?token=…&tournament_id=… */
export function parseTournamentInviteUrl(url: string): ParsedTournamentInvite | null {
  if (!url?.trim()) return null;
  try {
    const normalized = url.replace(/^padelapp:\/\//i, 'https://padelapp/');
    const parsed = new URL(normalized);
    const path = parsed.pathname.toLowerCase();
    const isInvitePath =
      path.includes('tournament-invite') ||
      path.includes('/tournaments/invites/') && path.endsWith('/accept');

    let token =
      parsed.searchParams.get('token')?.trim() ||
      parsed.searchParams.get('invite_token')?.trim() ||
      '';

    if (!token && path.includes('/invites/')) {
      const parts = path.split('/').filter(Boolean);
      const idx = parts.indexOf('invites');
      if (idx >= 0 && parts[idx + 1]) token = parts[idx + 1];
    }

    const tournamentId =
      parsed.searchParams.get('tournament_id')?.trim() ||
      parsed.searchParams.get('tournamentId')?.trim() ||
      '';

    if (!token || !tournamentId) return null;
    if (!isInvitePath && !url.includes('tournament')) return null;
    return { token, tournamentId };
  } catch {
    return null;
  }
}

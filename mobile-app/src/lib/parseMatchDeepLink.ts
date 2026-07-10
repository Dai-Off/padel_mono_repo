export type ParsedMatchDeepLink =
  | { kind: 'share'; matchId: string }
  | { kind: 'invite'; matchId: string; token: string };

/** Deep link público: wematch://match?match_id=… */
/** Deep link privado: wematch://match-invite?token=…&match_id=… */
export function parseMatchDeepLink(url: string): ParsedMatchDeepLink | null {
  if (!url?.trim()) return null;
  try {
    const normalized = url.replace(/^wematch:\/\//i, 'https://wematch/');
    const parsed = new URL(normalized);
    const path = parsed.pathname.toLowerCase();

    const matchIdFromQuery =
      parsed.searchParams.get('match_id')?.trim() ||
      parsed.searchParams.get('matchId')?.trim() ||
      parsed.searchParams.get('id')?.trim() ||
      '';

    const tokenFromQuery =
      parsed.searchParams.get('token')?.trim() ||
      parsed.searchParams.get('invite_token')?.trim() ||
      '';

    let token = tokenFromQuery;
    if (!token && path.includes('/invites/')) {
      const parts = path.split('/').filter(Boolean);
      const idx = parts.indexOf('invites');
      if (idx >= 0 && parts[idx + 1] && parts[idx + 1] !== 'received' && parts[idx + 1] !== 'inbox') {
        token = parts[idx + 1];
      }
    }

    const isInvitePath =
      path.includes('match-invite') ||
      (path.includes('/matches/invites/') && path.endsWith('/accept'));
    const isSharePath =
      path.includes('/matches/join/') ||
      path === '/match' ||
      path.endsWith('/match');

    let matchId = matchIdFromQuery;
    if (!matchId && path.includes('/matches/join/')) {
      const parts = path.split('/').filter(Boolean);
      const idx = parts.indexOf('join');
      if (idx >= 0 && parts[idx + 1]) matchId = parts[idx + 1];
    }

    if (isInvitePath && token && matchId) {
      return { kind: 'invite', matchId, token };
    }
    if (matchId && (isSharePath || url.includes('wematch://match') || path.includes('/matches/join/'))) {
      return { kind: 'share', matchId };
    }
    return null;
  } catch {
    return null;
  }
}

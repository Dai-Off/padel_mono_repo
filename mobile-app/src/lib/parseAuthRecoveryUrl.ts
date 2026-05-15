/**
 * Supabase recovery redirect suele traer tokens en el fragment (#access_token=...&type=recovery).
 */
export function parseSupabaseRecoveryFromUrl(url: string): {
  access_token?: string;
  refresh_token?: string;
  type?: string;
  token_hash?: string;
} {
  if (!url || typeof url !== 'string') return {};

  try {
    const qIdx = url.indexOf('?');
    const hIdx = url.indexOf('#');
    let queryPart = '';
    let hashPart = '';
    if (hIdx !== -1) {
      hashPart = url.slice(hIdx + 1);
    }
    if (qIdx !== -1) {
      const end = hIdx === -1 ? url.length : hIdx;
      queryPart = url.slice(qIdx + 1, end);
    }

    const out: { access_token?: string; refresh_token?: string; type?: string; token_hash?: string } = {};
    if (hashPart) {
      const sp = new URLSearchParams(hashPart);
      const at = sp.get('access_token');
      const rt = sp.get('refresh_token');
      const ty = sp.get('type');
      if (at) out.access_token = at;
      if (rt) out.refresh_token = rt;
      if (ty) out.type = ty;
    }
    if (queryPart) {
      const sp = new URLSearchParams(queryPart);
      const th = sp.get('token_hash');
      if (th) out.token_hash = th;
      if (!out.access_token) {
        const at = sp.get('access_token');
        if (at) out.access_token = at;
      }
      if (!out.refresh_token) {
        const rt = sp.get('refresh_token');
        if (rt) out.refresh_token = rt;
      }
      if (!out.type) {
        const ty = sp.get('type');
        if (ty) out.type = ty;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function isRecoveryDeepLink(url: string): boolean {
  const p = parseSupabaseRecoveryFromUrl(url);
  const recovery =
    p.type === 'recovery' || url.includes('type=recovery') || url.includes('type%3Drecovery');
  return recovery && (!!p.access_token || !!p.token_hash);
}

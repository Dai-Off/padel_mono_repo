const POSTER_URL_MAX = 2000;

export function normalizePosterUrl(
  body: Record<string, unknown>,
  key = 'poster_url'
): { ok: true; mode: 'omit' } | { ok: true; mode: 'set'; value: string | null } | { ok: false; error: string } {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return { ok: true, mode: 'omit' };
  const raw = body[key];
  if (raw == null) return { ok: true, mode: 'set', value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'poster_url debe ser texto o null' };
  const t = raw.trim();
  if (t.length === 0) return { ok: true, mode: 'set', value: null };
  if (t.length > POSTER_URL_MAX) return { ok: false, error: `poster_url admite como máximo ${POSTER_URL_MAX} caracteres` };
  if (!/^https?:\/\//i.test(t)) return { ok: false, error: 'poster_url debe ser una URL http(s) absoluta' };
  return { ok: true, mode: 'set', value: t };
}

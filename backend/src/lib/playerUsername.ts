import type { SupabaseClient } from '@supabase/supabase-js';

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export type UsernameNormalize =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function normalizeUsername(raw: unknown): UsernameNormalize {
  if (raw === null || raw === undefined) {
    return { ok: false, error: 'username es obligatorio' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'username debe ser texto' };
  }
  const value = raw.trim().toLowerCase();
  if (!value) {
    return { ok: false, error: 'username es obligatorio' };
  }
  if (value.includes('@')) {
    return { ok: false, error: 'username no puede contener @' };
  }
  if (!USERNAME_RE.test(value)) {
    return {
      ok: false,
      error: 'username debe tener 3–30 caracteres (letras minúsculas, números o _)',
    };
  }
  return { ok: true, value };
}

export function normalizeUsernameOptional(raw: unknown): UsernameNormalize | { ok: true; value: null } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  return normalizeUsername(raw);
}

export async function assertUsernameAvailable(
  supabase: SupabaseClient,
  username: string,
  excludePlayerId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  let q = supabase
    .from('players')
    .select('id')
    .eq('username', username)
    .neq('status', 'deleted');
  if (excludePlayerId) {
    q = q.neq('id', excludePlayerId);
  }
  const { data, error } = await q.maybeSingle();
  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }
  if (data) {
    return { ok: false, error: 'Este username ya está en uso', status: 409 };
  }
  return { ok: true };
}

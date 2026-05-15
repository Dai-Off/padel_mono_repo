import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  if (!url?.trim() || !anonKey?.trim()) return null;
  client = createClient(url, anonKey);
  return client;
}

export function parseHashParams(): { access_token?: string; refresh_token?: string; type?: string } {
  const hash = window.location.hash?.slice(1) || '';
  const params: Record<string, string> = {};
  hash.split('&').forEach((part) => {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) return;
    const k = decodeURIComponent(part.slice(0, eqIdx));
    const v = decodeURIComponent(part.slice(eqIdx + 1));
    if (k && v) params[k] = v;
  });
  return params;
}

/** Fragmento (#...) o cadena sin # con tokens de recovery de Supabase (implicit flow). */
export function isSupabaseRecoveryHash(hashOrFragment: string): boolean {
  const h = hashOrFragment.startsWith('#') ? hashOrFragment.slice(1) : hashOrFragment;
  if (!h) return false;
  const hasType = h.includes('type=recovery') || h.includes('type%3Drecovery');
  const hasAt =
    h.includes('access_token=') ||
    h.includes('access_token%3D') ||
    h.includes('access_token%3d');
  return hasType && hasAt;
}

export function isSupabaseRecoverySearch(search: string): boolean {
  const q = search.startsWith('?') ? search.slice(1) : search;
  if (!q) return false;
  try {
    const sp = new URLSearchParams(q);
    return sp.get('type') === 'recovery' && !!sp.get('access_token');
  } catch {
    return false;
  }
}

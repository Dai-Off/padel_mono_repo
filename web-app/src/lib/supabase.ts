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
    const [k, v] = part.split('=');
    if (k && v) params[decodeURIComponent(k)] = decodeURIComponent(v);
  });
  return params;
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;
let serviceRoleClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (supabaseClient) return supabaseClient;

  const url = (process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

  if (!url) throw new Error('Missing env SUPABASE_URL');
  const keyToUse = serviceRoleKey || anonKey;
  if (!keyToUse) throw new Error('Missing env SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');

  supabaseClient = createClient(url, keyToUse, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseClient;
};

export const getSupabaseAnonClient = (): SupabaseClient => {
  if (anonClient) return anonClient;

  const url = (process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url) throw new Error('Missing env SUPABASE_URL');
  if (!anonKey) throw new Error('Missing env SUPABASE_ANON_KEY');

  anonClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return anonClient;
};

export const getSupabaseServiceRoleClient = (): SupabaseClient => {
  if (serviceRoleClient) return serviceRoleClient;

  const url = (process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url) throw new Error('Missing env SUPABASE_URL');
  if (!serviceRoleKey) {
    throw new Error('Missing env SUPABASE_SERVICE_ROLE_KEY');
  }

  serviceRoleClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serviceRoleClient;
};

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'club-images';

/** Duración de URLs firmadas para consumo en apps (se regeneran en cada request). */
const SIGNED_READ_EXPIRES_SEC = 60 * 60 * 24 * 365;

type ParsedStorage = { bucket: string; objectPath: string; kind: 'sign' | 'public' };

/**
 * Extrae bucket y ruta del objeto desde URLs públicas o firmadas de Supabase Storage.
 */
export function extractStorageObjectFromSupabaseUrl(urlStr: string): ParsedStorage | null {
  try {
    const u = new URL(urlStr.trim());
    const { pathname } = u;
    const signMarker = '/storage/v1/object/sign/';
    const publicMarker = '/storage/v1/object/public/';
    if (pathname.includes(signMarker)) {
      const rest = pathname.slice(pathname.indexOf(signMarker) + signMarker.length);
      const parts = rest.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      const bucket = parts[0]!;
      const objectPath = parts.slice(1).join('/');
      return { bucket, objectPath, kind: 'sign' };
    }
    if (pathname.includes(publicMarker)) {
      const rest = pathname.slice(pathname.indexOf(publicMarker) + publicMarker.length);
      const parts = rest.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      const bucket = parts[0]!;
      const objectPath = parts.slice(1).join('/');
      return { bucket, objectPath, kind: 'public' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Devuelve una URL que la app puede usar para mostrar el logo.
 * - URLs públicas de Supabase: sin cambios.
 * - URLs firmadas caducadas: nueva firma con service role.
 * - Solo path (sin http): bucket por defecto `club-images`.
 * - Cualquier otra URL http(s): sin cambios (CDN externo, etc.).
 */
export async function resolveClubLogoUrlForClient(
  supabase: SupabaseClient,
  logoUrl: string | null | undefined,
  expiresSec = SIGNED_READ_EXPIRES_SEC
): Promise<string | null> {
  const raw = typeof logoUrl === 'string' ? logoUrl.trim() : '';
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    const { data, error } = await supabase.storage
      .from(DEFAULT_BUCKET)
      .createSignedUrl(raw, expiresSec);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  const parsed = extractStorageObjectFromSupabaseUrl(raw);
  if (parsed) {
    if (parsed.kind === 'public') return raw;
    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.objectPath, expiresSec);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  return raw;
}

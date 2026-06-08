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

type ClubImageRow = {
  id?: string;
  logo_url?: string | null;
  photo_urls?: unknown;
  display_image_url?: string | null;
};

/** Prioridad: primera foto del club, luego logo_url. */
export function pickClubImageSource(club: ClubImageRow | null | undefined): string | null {
  const firstPhoto =
    Array.isArray(club?.photo_urls) && club.photo_urls.length > 0
      ? String(club.photo_urls[0]).trim()
      : null;
  const logo = typeof club?.logo_url === 'string' ? club.logo_url.trim() : '';
  return firstPhoto || logo || null;
}

/**
 * Resuelve URLs de imagen de club en filas de matches expandidas (in-place).
 * Deduplica por club_id para no firmar la misma imagen N veces por request.
 */
export async function enrichMatchRowsWithClubImages(
  supabase: SupabaseClient,
  rows: unknown[],
): Promise<void> {
  const rawByClub = new Map<string, string>();
  for (const row of rows) {
    const r = row as { bookings?: unknown };
    const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
    const club = (b as { courts?: { clubs?: ClubImageRow } } | null)?.courts?.clubs;
    const id = club?.id;
    if (!id || rawByClub.has(id)) continue;
    const raw = pickClubImageSource(club);
    if (raw) rawByClub.set(id, raw);
  }
  if (rawByClub.size === 0) return;

  const resolved = new Map<string, string>();
  await Promise.all(
    [...rawByClub.entries()].map(async ([id, raw]) => {
      try {
        const url = await resolveClubLogoUrlForClient(supabase, raw);
        if (url) resolved.set(id, url);
      } catch (err) {
        console.warn('[enrichMatchRowsWithClubImages] skip club', id, err);
      }
    }),
  );

  for (const row of rows) {
    const r = row as { bookings?: unknown };
    const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
    const club = (b as { courts?: { clubs?: ClubImageRow } } | null)?.courts?.clubs;
    if (!club?.id) continue;
    const url = resolved.get(club.id);
    if (url) club.display_image_url = url;
  }
}

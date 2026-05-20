import { API_URL } from '../config';
import { readImageBytesFromUri } from '../lib/readImageBytes';
import { getSupabaseClient } from '../lib/supabase';

export type PickedImage = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

function extFromImage(image: PickedImage): string {
  const fromName = image.fileName?.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  const mime = image.mimeType?.toLowerCase() ?? '';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

async function getAuthedSupabase(accessToken: string, refreshToken: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase no configurado (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY)');
  }
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw new Error(error.message);
  return supabase;
}

/** Sube a `player-avatars/{authUserId}/avatar.ext` (misma ruta que web). */
export async function uploadPlayerAvatarToStorage(
  authUserId: string,
  accessToken: string,
  refreshToken: string,
  image: PickedImage,
): Promise<string> {
  const supabase = await getAuthedSupabase(accessToken, refreshToken);
  const ext = extFromImage(image);
  const path = `${authUserId}/avatar.${ext}`;
  const bytes = await readImageBytesFromUri(image.uri);
  const contentType =
    image.mimeType?.trim() || (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);

  const { error: upErr } = await supabase.storage.from('player-avatars').upload(path, bytes, {
    upsert: true,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from('player-avatars').getPublicUrl(path);
  const base = pub.publicUrl;
  return `${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

async function patchPlayerMedia(
  token: string,
  body: { avatar_url?: string | null; cover_url?: string | null },
  errorFallback: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/players/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? errorFallback };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function patchMyAvatarUrl(
  token: string,
  avatar_url: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return patchPlayerMedia(token, { avatar_url }, 'No se pudo guardar la foto');
}

/** Sube a `player-avatars/{authUserId}/cover.ext`. */
export async function uploadPlayerCoverToStorage(
  authUserId: string,
  accessToken: string,
  refreshToken: string,
  image: PickedImage,
): Promise<string> {
  const supabase = await getAuthedSupabase(accessToken, refreshToken);
  const ext = extFromImage(image);
  const path = `${authUserId}/cover.${ext}`;
  const bytes = await readImageBytesFromUri(image.uri);
  const contentType =
    image.mimeType?.trim() || (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);

  const { error: upErr } = await supabase.storage.from('player-avatars').upload(path, bytes, {
    upsert: true,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from('player-avatars').getPublicUrl(path);
  const base = pub.publicUrl;
  return `${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

export async function patchMyCoverUrl(
  token: string,
  cover_url: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return patchPlayerMedia(token, { cover_url }, 'No se pudo guardar la portada');
}

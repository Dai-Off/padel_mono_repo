import { API_URL } from '../config';

export type PickedImage = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

/** URL usable en `<Image />`: https o URI local del dispositivo. */
export function normalizePlayerAvatarUrl(url: string | null | undefined): string | null {
  const t = url?.trim();
  if (!t) return null;
  if (
    t.startsWith('file://') ||
    t.startsWith('content://') ||
    t.startsWith('ph://') ||
    t.startsWith('data:')
  ) {
    return t;
  }
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

/** URIs que ya cargaron en `<Image />` — evita pantalla vacía al remontar. */
const loadedAvatarUris = new Set<string>();

export function markPlayerAvatarUriLoaded(url: string | null | undefined): void {
  const uri = normalizePlayerAvatarUrl(url);
  if (uri) loadedAvatarUris.add(uri);
}

export function isPlayerAvatarUriLoaded(url: string | null | undefined): boolean {
  const uri = normalizePlayerAvatarUrl(url);
  return uri != null && loadedAvatarUris.has(uri);
}

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

type PlayerMediaKind = 'avatar' | 'cover';

async function uploadPlayerMediaViaApi(
  token: string,
  image: PickedImage,
  kind: PlayerMediaKind,
): Promise<string> {
  const ext = extFromImage(image);
  const contentType =
    image.mimeType?.trim() || (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);

  const formData = new FormData();
  formData.append('file', {
    uri: image.uri,
    name: `${kind}.${ext}`,
    type: contentType,
  } as unknown as Blob);

  const res = await fetch(`${API_URL}/players/me/${kind}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !json.ok || !json.url?.trim()) {
    throw new Error(
      json.error ??
        (kind === 'avatar' ? 'No se pudo subir la foto de perfil' : 'No se pudo subir la portada'),
    );
  }
  return json.url.trim();
}

/** Sube avatar vía backend (Storage + DB). No requiere Supabase en el cliente. */
export async function uploadPlayerAvatarToStorage(
  _authUserId: string,
  accessToken: string,
  _refreshToken: string,
  image: PickedImage,
): Promise<string> {
  return uploadPlayerMediaViaApi(accessToken, image, 'avatar');
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

/** Sube portada vía backend (Storage + DB). No requiere Supabase en el cliente. */
export async function uploadPlayerCoverToStorage(
  _authUserId: string,
  accessToken: string,
  _refreshToken: string,
  image: PickedImage,
): Promise<string> {
  return uploadPlayerMediaViaApi(accessToken, image, 'cover');
}

export async function patchMyCoverUrl(
  token: string,
  cover_url: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return patchPlayerMedia(token, { cover_url }, 'No se pudo guardar la portada');
}

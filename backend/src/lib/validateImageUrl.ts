const IMAGE_CONTENT_TYPES = /^image\/(jpeg|jpg|png|webp|gif|avif)/i;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchImageProbe(url: string): Promise<{ ok: boolean; contentType?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const headers = {
    'User-Agent': 'WeMatch-Store/1.0 (image-validation)',
    Accept: 'image/*,*/*',
  };
  try {
    let res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow', headers });
    if (res.ok) {
      return { ok: true, contentType: res.headers.get('content-type') ?? undefined };
    }
    if (res.status === 405 || res.status === 501 || res.status === 403 || !res.ok) {
      res = await fetch(url, {
        method: 'GET',
        headers: { ...headers, Range: 'bytes=0-2047' },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) return { ok: false };
      return { ok: true, contentType: res.headers.get('content-type') ?? undefined };
    }
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

export async function assertReachableImageUrl(
  url: string,
  label = 'La imagen'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, error: `${label} es obligatoria para publicar el producto` };
  }
  if (!isHttpUrl(trimmed)) {
    return { ok: false, error: `${label} debe ser una URL http o https válida` };
  }

  try {
    const probe = await fetchImageProbe(trimmed);
    if (!probe.ok) {
      return { ok: false, error: `${label} no está disponible o la URL está rota` };
    }
    const contentType = probe.contentType?.split(';')[0]?.trim();
    if (contentType && !IMAGE_CONTENT_TYPES.test(contentType) && !contentType.includes('octet-stream')) {
      return { ok: false, error: `${label} no apunta a un archivo de imagen válido` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: `No se pudo verificar ${label.toLowerCase()}. Probá subir el archivo de nuevo.` };
  }
}

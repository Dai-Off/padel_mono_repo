export function probeImageUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const trimmed = url.trim();
    if (!trimmed) {
      reject(new Error('La imagen es obligatoria para publicar el producto'));
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        reject(new Error('La URL de la imagen no es válida'));
        return;
      }
    } catch {
      reject(new Error('La URL de la imagen no es válida'));
      return;
    }

    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('La imagen no carga. Subí otra foto o revisá la URL'));
    img.src = trimmed;
  });
}

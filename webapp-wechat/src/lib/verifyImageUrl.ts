/** Precarga la imagen en el navegador para detectar URLs rotas antes de publicar. */
export function verifyImageLoads(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    return Promise.reject(new Error('La imagen del producto es obligatoria para publicar'));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () =>
      reject(new Error('La imagen no carga correctamente. Subí otra foto o revisá la URL.'));
    img.src = trimmed;
  });
}

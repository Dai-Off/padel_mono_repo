/** Copia texto al portapapeles; fallback si el gesto de usuario ya expiró tras un await largo. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Continúa con fallback
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copia texto producido de forma async (p. ej. tras crear un partido).
 * Usa ClipboardItem diferido para conservar el permiso del click del usuario.
 * Debe llamarse de forma síncrona desde el handler del click (sin await previo).
 */
export async function copyTextFromAsyncProducer(
  produce: () => Promise<string>,
): Promise<{ ok: boolean; text: string | null }> {
  let resolvedText: string | null = null;
  let produceError: unknown = null;

  const runProduce = async (): Promise<string> => {
    try {
      const text = await produce();
      resolvedText = text;
      return text;
    } catch (err) {
      produceError = err;
      throw err;
    }
  };

  const canUseDeferredClipboard =
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function';

  if (canUseDeferredClipboard) {
    const blobPromise = runProduce().then(
      (text) => new Blob([text], { type: 'text/plain' }),
    );
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': blobPromise }),
      ]);
      return { ok: true, text: resolvedText };
    } catch {
      // Produce pudo haber terminado bien y solo falló el write, o falló produce.
      if (produceError) throw produceError;
      if (resolvedText) {
        const ok = await copyTextToClipboard(resolvedText);
        return { ok, text: resolvedText };
      }
    }
  }

  const text = await runProduce();
  const ok = await copyTextToClipboard(text);
  return { ok, text };
}

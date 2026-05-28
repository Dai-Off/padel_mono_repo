import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizeAndValidatePhone(
  raw: string,
): { ok: true; e164: string } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) {
    return { ok: false, error: 'El teléfono es obligatorio.' };
  }
  try {
    const phone = parsePhoneNumberFromString(t);
    if (!phone || !phone.isValid()) {
      return {
        ok: false,
        error: 'Teléfono no válido. Usa el prefijo internacional correcto (ej. +34600111222).',
      };
    }
    const e164 = phone.format('E.164');
    if (e164.length > 40) {
      return { ok: false, error: 'Teléfono demasiado largo.' };
    }
    return { ok: true, e164 };
  } catch {
    return { ok: false, error: 'Teléfono no válido.' };
  }
}

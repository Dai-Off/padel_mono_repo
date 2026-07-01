/** Zona horaria oficial del club (España peninsular: CET/CEST). */
export const CLUB_IANA_TIMEZONE = 'Europe/Madrid';

export function clubTimezoneOrDefault(raw?: string | null): string {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return CLUB_IANA_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: t }).format(new Date());
    return t;
  } catch {
    return CLUB_IANA_TIMEZONE;
  }
}

/** Normaliza un país (quita acentos, espacios y mayúsculas) para comparar. */
function normalizeCountry(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Deriva la zona horaria IANA a partir del país declarado en el alta del club.
 * Cubre los países del formulario de registro. Devuelve null si no se reconoce,
 * para que el llamador decida el fallback (no forzamos una zona horaria fija).
 */
export function countryToTimezone(country: unknown): string | null {
  const key = normalizeCountry(country);
  if (!key) return null;
  const map: Record<string, string> = {
    espana: 'Europe/Madrid',
    spain: 'Europe/Madrid',
    mexico: 'America/Mexico_City',
    argentina: 'America/Argentina/Buenos_Aires',
    chile: 'America/Santiago',
    colombia: 'America/Bogota',
    peru: 'America/Lima',
    ecuador: 'America/Guayaquil',
    uruguay: 'America/Montevideo',
    portugal: 'Europe/Lisbon',
    italia: 'Europe/Rome',
    italy: 'Europe/Rome',
    francia: 'Europe/Paris',
    france: 'Europe/Paris',
    alemania: 'Europe/Berlin',
    germany: 'Europe/Berlin',
    'reino unido': 'Europe/London',
    'united kingdom': 'Europe/London',
    suecia: 'Europe/Stockholm',
    sweden: 'Europe/Stockholm',
    'paises bajos': 'Europe/Amsterdam',
    netherlands: 'Europe/Amsterdam',
    eau: 'Asia/Dubai',
    'emiratos arabes unidos': 'Asia/Dubai',
    qatar: 'Asia/Qatar',
  };
  return map[key] ?? null;
}

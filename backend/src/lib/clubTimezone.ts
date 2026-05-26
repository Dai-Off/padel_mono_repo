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

import { DEFAULT_LOCALE, type AppLocale } from '../i18n/constants';

let apiLocale: AppLocale = DEFAULT_LOCALE;

/** Mantiene el locale actual para llamadas API fuera de React. */
export function syncApiLocale(locale: AppLocale): void {
  apiLocale = locale;
}

export function getBackendApiLang(): AppLocale {
  return apiLocale;
}

export function withLangQuery(path: string, locale?: AppLocale): string {
  const lang = locale ?? apiLocale;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}lang=${encodeURIComponent(lang)}`;
}

export const APP_LANGUAGE_KEY = '@app_language';

export type AppLocale = 'es' | 'zh-HK';

export const DEFAULT_LOCALE: AppLocale = 'es';

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === 'es' || value === 'zh-HK';
}

/** Locale BCP 47 para `Intl` / `toLocaleString`. */
export function formatLocale(locale: AppLocale): string {
  return locale === 'zh-HK' ? 'zh-HK' : 'es-ES';
}

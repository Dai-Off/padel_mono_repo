import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APP_LANGUAGE_KEY,
  DEFAULT_LOCALE,
  isAppLocale,
  type AppLocale,
} from './constants';
import { es } from './es';
import { zhHK } from './zh-HK';
import type { TranslationKeys } from './translations';

const translationsMap: Record<AppLocale, TranslationKeys> = {
  es,
  'zh-HK': zhHK,
};

interface I18nContextType {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  ready: boolean;
}

const I18nContext = createContext<I18nContextType | null>(null);

function resolveKey(obj: unknown, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(APP_LANGUAGE_KEY);
        if (mounted && isAppLocale(stored)) {
          setLocaleState(stored);
        }
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    void AsyncStorage.setItem(APP_LANGUAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const translations = translationsMap[locale];
      let value = resolveKey(translations, key);

      if (value === undefined) {
        value = resolveKey(translationsMap.es, key);
      }

      if (value === undefined) {
        return key;
      }

      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
        }
      }

      return value;
    },
    [locale],
  );

  const contextValue = useMemo(
    () => ({ locale, setLocale, t, ready }),
    [locale, setLocale, t, ready],
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}

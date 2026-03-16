import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { Locale, TranslationKeys } from './translations';
import { es } from './es';
import { zhHK } from './zh-HK';

const translationsMap: Record<Locale, TranslationKeys> = {
    'es': es,
    'zh-HK': zhHK,
};

interface I18nContextType {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
    tData: (value: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getStoredLocale(): Locale {
    try {
        const stored = localStorage.getItem('padel-locale');
        if (stored === 'es' || stored === 'zh-HK') return stored;
    } catch {
        // localStorage not available
    }
    return 'zh-HK';
}

/**
 * Resolve a dot-notation key like "header.close" against a translations object.
 */
function resolveKey(obj: unknown, key: string): string | undefined {
    const parts = key.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : undefined;
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [locale, setLocaleState] = useState<Locale>(getStoredLocale);

    const setLocale = useCallback((newLocale: Locale) => {
        setLocaleState(newLocale);
        try {
            localStorage.setItem('padel-locale', newLocale);
        } catch {
            // ignore
        }
    }, []);

    const t = useCallback((key: string, params?: Record<string, string | number>): string => {
        const translations = translationsMap[locale];
        let value = resolveKey(translations, key);

        if (value === undefined) {
            // Fallback to Spanish
            value = resolveKey(translationsMap['es'], key);
        }

        if (value === undefined) {
            // Return the key itself as last resort
            return key;
        }

        // Replace {param} placeholders
        if (params) {
            for (const [paramKey, paramValue] of Object.entries(params)) {
                value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
            }
        }

        return value;
    }, [locale]);

    const tData = useCallback((value: string): string => {
        if (!value) return value;
        const translations = translationsMap[locale];
        return translations.dataLabels[value] || value;
    }, [locale]);

    const contextValue = useMemo(() => ({ locale, setLocale, t, tData }), [locale, setLocale, t, tData]);

    return (
        <I18nContext.Provider value={contextValue}>
            {children}
        </I18nContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useTranslation() {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useTranslation must be used within an I18nProvider');
    }
    return context;
}

export { I18nContext };

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { esTranslations } from './locales/es/index.ts';
import { enTranslations } from './locales/en/index.ts';
import zhTranslations from './locales/zh/index.ts';

/** Migra idioma guardado por ajustes del club antes de unificar en i18next. */
function migrateLegacyLanguageKey(): void {
    try {
        const next = localStorage.getItem('i18nextLng');
        const legacy = localStorage.getItem('courthub-language');
        if (!next && legacy && ['es', 'en', 'zh'].some((c) => legacy === c || legacy.startsWith(c))) {
            const base = legacy.split('-')[0] as 'es' | 'en' | 'zh';
            if (base === 'es' || base === 'en' || base === 'zh') {
                localStorage.setItem('i18nextLng', base);
            }
        }
        const padel = localStorage.getItem('padel-locale');
        if (!localStorage.getItem('i18nextLng') && padel === 'zh-HK') {
            localStorage.setItem('i18nextLng', 'zh');
        }
    } catch {
        /* ignore */
    }
}

migrateLegacyLanguageKey();

const resources = {
    es: {
        translation: {
            ...esTranslations
        }
    },
    en: {
        translation: {
            ...enTranslations
        }
    },
    zh: {
        translation: {
            ...zhTranslations
        }
    }
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        lng: 'es',
        fallbackLng: 'es',
        debug: false,
        interpolation: {
            escapeValue: false
        },
        detection: {
            order: ['localStorage'],
            caches: ['localStorage'],
        }
    });

export default i18n;

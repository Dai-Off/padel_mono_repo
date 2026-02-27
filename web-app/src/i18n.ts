import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { esTranslations } from './locales/es/index.ts';
import { enTranslations } from './locales/en/index.ts';
import zhTranslations from './locales/zh/index.ts';

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
        fallbackLng: 'es',
        debug: false,
        interpolation: {
            escapeValue: false
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
        }
    });

export default i18n;

import type { AppLocale } from '../i18n/constants';
import { INFO_SCREENS_ES } from './infoContent.es';
import { INFO_SCREENS_ZH_HK } from './infoContent.zh-HK';

export type InfoScreenId = 'help' | 'how-it-works' | 'terms' | 'privacy';

export type InfoBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'contact'; email: string; label?: string };

export type InfoScreenContent = {
  title: string;
  lastUpdated: string;
  blocks: InfoBlock[];
};

export const SUPPORT_EMAIL = 'soporte@wematch.com';

const INFO_SCREENS_BY_LOCALE = {
  es: INFO_SCREENS_ES,
  'zh-HK': INFO_SCREENS_ZH_HK,
} as const;

export function getInfoScreens(locale: AppLocale): Record<InfoScreenId, InfoScreenContent> {
  return INFO_SCREENS_BY_LOCALE[locale] ?? INFO_SCREENS_ES;
}

/** @deprecated Use getInfoScreens(locale) */
export const INFO_SCREENS = INFO_SCREENS_ES;

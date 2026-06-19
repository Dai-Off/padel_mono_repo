import type { CommonTranslationKeys } from './sections/common';
import type { NavTranslationKeys } from './sections/nav';
import type { AuthTranslationKeys } from './sections/auth';
import type { HomeTranslationKeys } from './sections/home';
import type { OnboardingTranslationKeys } from './sections/onboarding';
import type { SettingsTranslationKeys } from './sections/settings';
import type { ProfileTranslationKeys } from './sections/profile';
import type { PreferencesTranslationKeys } from './sections/preferences';
import type { PartidosTranslationKeys } from './sections/partidos';
import type { SearchTranslationKeys } from './sections/search';
import type { TiendaTranslationKeys } from './sections/tienda';
import type { TorneosTranslationKeys } from './sections/torneos';
import type { MessagesTranslationKeys } from './sections/messages';
import type { WalletTranslationKeys } from './sections/wallet';
import type { CommunityTranslationKeys } from './sections/community';
import type { LearningTranslationKeys } from './sections/learning';
import type { ActivityTranslationKeys } from './sections/activity';
import type { AlertsTranslationKeys } from './sections/alerts';
import type { CompetitiveTranslationKeys } from './sections/competitive';

export type { AppLocale } from './constants';

export type {
  CommonTranslationKeys,
  NavTranslationKeys,
  AuthTranslationKeys,
  HomeTranslationKeys,
  OnboardingTranslationKeys,
  SettingsTranslationKeys,
  ProfileTranslationKeys,
  PreferencesTranslationKeys,
  PartidosTranslationKeys,
  SearchTranslationKeys,
  TiendaTranslationKeys,
  TorneosTranslationKeys,
  MessagesTranslationKeys,
  WalletTranslationKeys,
  CommunityTranslationKeys,
  LearningTranslationKeys,
  ActivityTranslationKeys,
  AlertsTranslationKeys,
  CompetitiveTranslationKeys,
};

export interface TranslationKeys {
  common: CommonTranslationKeys;
  nav: NavTranslationKeys;
  auth: AuthTranslationKeys;
  home: HomeTranslationKeys;
  competitive: CompetitiveTranslationKeys;
  onboarding: OnboardingTranslationKeys;
  settings: SettingsTranslationKeys;
  profile: ProfileTranslationKeys;
  preferences: PreferencesTranslationKeys;
  partidos: PartidosTranslationKeys;
  search: SearchTranslationKeys;
  tienda: TiendaTranslationKeys;
  torneos: TorneosTranslationKeys;
  messages: MessagesTranslationKeys;
  wallet: WalletTranslationKeys;
  community: CommunityTranslationKeys;
  learning: LearningTranslationKeys;
  activity: ActivityTranslationKeys;
  alerts: AlertsTranslationKeys;
}

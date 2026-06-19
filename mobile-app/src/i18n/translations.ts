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
};

export interface CompetitiveTranslationKeys {
  mode: { title: string; solo: string; soloSub: string; friend: string; friendSub: string };
  search: { cta: string; ctaWith: string; searchingWith: string; searching: string };
  shield: { activeOne: string; activeMany: string };
  lp: { progress: string; only: string; promoteLine: string; maxDivision: string };
  demanding: { title: string; message: string; searchAnyway: string };
  partner: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    searchHint: string;
    empty: string;
    ready: string;
    acceptedSub: string;
    orInvite: string;
    pending: string;
    waiting: string;
    inviteSent: string;
    received: string;
    invitedYou: string;
    leavePair: string;
    leavePairMsg: string;
  };
  banner: { invitesYou: string; sub: string; reject: string; accept: string; acceptSearch: string; count: string };
  season: { endKicker: string; endedIn: string; newKicker: string; newLiga: string; next: string; cta: string };
  common: { cancel: string; couldNot: string; close: string };
  screen: {
    errors: {
      needLogin: string;
      noClubsInDistance: string;
      noClubsLoaded: string;
      timedOut: string;
      rankingLoadFailed: string;
      matchLoadFailed: string;
      matchShowFailed: string;
      genericError: string;
    };
    resume: { matched: string; searching: string };
    hero: {
      badge: string;
      currentDivision: string;
      peak: string;
      noHistory: string;
      winsShort: string;
      lossesShort: string;
      wr: string;
      leaguePointsCap: string;
      seasonResetFoot: string;
    };
    tabs: { myLeague: string; ranking: string };
    search: { title: string; subtitle: string };
    recent: {
      header: string;
      currentSeason: string;
      empty: string;
      rivals: string;
      rivalsWithLiga: string;
      rivalsPending: string;
      recent: string;
    };
    how: { title: string; line1: string; line2: string; line3: string; line5: string };
    ranking: {
      loading: string;
      showing: string;
      playersInDivisionOne: string;
      playersInDivisionMany: string;
      noPlayers: string;
      top: string;
      notAvailable: string;
      noneClassified: string;
      loadingMore: string;
      wl: string;
      me: string;
      meSelf: string;
    };
    prefs: {
      title: string;
      subtitle: string;
      locationPermission: string;
      locationBannerActivate: string;
      locationBannerChooseClubs: string;
      formatTitle: string;
      pairFormatTitle: string;
      pairFormatSub: string;
      scheduleTitle: string;
      morning: string;
      morningHours: string;
      afternoon: string;
      afternoonHours: string;
      night: string;
      nightHours: string;
      demoMode: string;
      searchingInClubsOne: string;
      searchingInClubsMany: string;
      maxDistance: string;
      distanceKm: string;
      kmShort: string;
      clubsInRangeDemo: string;
      clubsInRange: string;
      calculatingDistances: string;
      loadingClubs: string;
      noneInDistance: string;
      noLocationPickClubs: string;
      activateLocationToSee: string;
      moreClubs: string;
      modality: string;
      any: string;
      male: string;
      female: string;
      mixed: string;
      preferredSide: string;
      left: string;
      right: string;
      both: string;
      preferredClubsTitle: string;
      choosePreferredClubs: string;
      clubsSelectedOne: string;
      clubsSelectedMany: string;
      noClubsHint: string;
    };
    queue: {
      searchingTitle: string;
      timeInQueue: string;
      playersInQueue: string;
      searchingPartner: string;
      format: string;
      formatValue: string;
      schedule: string;
      location: string;
      upToKm: string;
      modality: string;
      noPref: string;
      side: string;
      backgroundTitle: string;
      backgroundText: string;
      minimize: string;
      cancel: string;
    };
    found: {
      title: string;
      subtitle: string;
      yourTeammate: string;
      rivalPair: string;
      lpInfo: string;
      confirmHint: string;
      rejectWarning: string;
      opening: string;
      confirm: string;
      reject: string;
    };
    proposal: {
      teammatePending: string;
      levelValue: string;
      levelUnknown: string;
      rivalPairPending: string;
      winProb: string;
      winProbUnknown: string;
      clubPending: string;
      distanceKm: string;
      noDate: string;
      duration: string;
    };
    picker: { title: string; subtitle: string };
    relative: { today: string; oneDayAgo: string; daysAgo: string; oneWeekAgo: string; weeksAgo: string };
    fallback: { club: string; player: string; noDivision: string; superiorPlayer: string };
  };
}

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

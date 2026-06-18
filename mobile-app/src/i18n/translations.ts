export type { AppLocale } from './constants';

export interface HomeTranslationKeys {
  header: {
    openMenu: string;
    messages: string;
    notifications: string;
    groups: string;
  };
  errorBanner: {
    title: string;
    subtitle: string;
    retry: string;
    retrying: string;
  };
  onboardingBanner: {
    discoverLevel: string;
    unlockContent: string;
    matchmakingSearching: string;
    matchmakingSearchingSub: string;
    matchmakingMatched: string;
    matchmakingMatchedSub: string;
    matchmakingTimeout: string;
    matchmakingTimeoutSub: string;
  };
  proximosPartidos: {
    title: string;
    loading: string;
    empty: string;
    oneConfirmed: string;
    manyConfirmed: string;
  };
  quickActions: {
    findMatch: string;
    findMatchSub: string;
    openMatchOne: string;
    openMatchMany: string;
    courts: string;
    courtsSub: string;
    courtFreeOne: string;
    courtFreeMany: string;
    classes: string;
    classesSub: string;
    tournaments: string;
    tournamentsSub: string;
    tournamentOne: string;
    tournamentMany: string;
  };
  dailyLesson: {
    title: string;
    subtitle: string;
    locked: string;
    lockedA11y: string;
    done: string;
    continue: string;
    start: string;
    dayOne: string;
    dayMany: string;
    bonusCountdown: string;
    dayRemainingOne: string;
    dayRemainingMany: string;
    bonus15: string;
    bonus2: string;
    bonus25: string;
    bonus3: string;
    weekDays: [string, string, string, string, string, string, string];
  };
  seasonPass: {
    seasonFallback: string;
    titleFallback: string;
    level: string;
    next: string;
    seasonSlug: string;
    seasonMax: string;
    levelN: string;
    spToNext: string;
    spCap: string;
  };
  competitiveLeague: {
    title: string;
    subtitle: string;
    locked: string;
    lockedA11y: string;
    yourDivision: string;
    leaguePoints: string;
    footerHint: string;
    wins: string;
    losses: string;
  };
  iaAfinidad: {
    title: string;
    description: string;
    locked: string;
    lockedA11y: string;
  };
  missions: {
    title: string;
    viewAll: string;
    emptyTitle: string;
    emptySub: string;
    periodDaily: string;
    periodWeekly: string;
    periodMonthly: string;
  };
  enDirecto: {
    title: string;
    loading: string;
    emptyCount: string;
    liveOne: string;
    liveMany: string;
    competitive: string;
    casual: string;
    playerOne: string;
    playerMany: string;
    emptyTitle: string;
    emptySubtitle: string;
    exploreMatches: string;
    exploreMatchesA11y: string;
  };
  hardBlock: {
    dailyLessonTitle: string;
    dailyLessonSub: string;
    dailyLessonBullets: [string, string, string];
    iaTitle: string;
    iaSub: string;
    iaBullets: [string, string, string];
    leagueTitle: string;
    leagueSub: string;
    leagueBullets: [string, string, string];
  };
}

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
  };
  banner: { invitesYou: string; sub: string; reject: string; accept: string; acceptSearch: string; count: string };
  common: { cancel: string; couldNot: string };
}

export interface TranslationKeys {
  home: HomeTranslationKeys;
  competitive: CompetitiveTranslationKeys;
}

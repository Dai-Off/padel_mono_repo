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
    received: string;
    invitedYou: string;
    leavePair: string;
    leavePairMsg: string;
  };
  banner: { invitesYou: string; sub: string; reject: string; accept: string; acceptSearch: string; count: string };
  season: { endKicker: string; endedIn: string; newKicker: string; newLiga: string; next: string; cta: string };
  common: { cancel: string; couldNot: string };
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
      noDate: string;
      duration: string;
    };
    picker: { title: string; subtitle: string };
    relative: { today: string; oneDayAgo: string; daysAgo: string; oneWeekAgo: string; weeksAgo: string };
    fallback: { club: string; player: string; noDivision: string; superiorPlayer: string };
  };
}

export interface TranslationKeys {
  home: HomeTranslationKeys;
  competitive: CompetitiveTranslationKeys;
}

export interface AlertsTranslationKeys {
  session: {
    title: string;
    loginRequired: string;
  };
  login: {
    title: string;
    titleAlt: string;
  };
  permissionDenied: {
    title: string;
  };
  error: {
    title: string;
  };
  ready: {
    title: string;
  };
  canceled: {
    title: string;
  };
  paymentRegistered: {
    title: string;
  };
  slotPending: {
    title: string;
  };
  slotTaken: {
    title: string;
    body: string;
  };
  matchFull: {
    title: string;
    body: string;
  };
  scheduleConflict: {
    title: string;
    body: string;
  };
  alreadyInMatch: {
    title: string;
    body: string;
  };
  matchCompletedWhilePaying: string;
  slotAssigned: {
    title: string;
    body: string;
  };
  paymentPending: {
    body: string;
  };
  declineMatch: {
    title: string;
    body: string;
    yes: string;
    done: string;
  };
  leaveMatch: {
    titleCancel: string;
    titleLeave: string;
    bodySolo: string;
    bodyMulti: string;
    bodyOrganizerCancel: string;
    bodyOrganizerCancelNoRefund: string;
    bodySoloNoRefund: string;
    bodyMultiNoRefund: string;
    policyNoRefundDefault: string;
    cancel: string;
    leave: string;
    yesCancel: string;
    yesLeave: string;
    doneCancel: string;
    doneLeave: string;
    doneCancelWithRefund: string;
    doneCancelNoRefund: string;
    doneLeaveWithRefund: string;
    doneLeaveNoRefund: string;
    fail: string;
  };
  privateCancel: {
    title: string;
    done: string;
    doneNoRefund: string;
    fail: string;
  };
  tournamentInvite: {
    accepted: string;
    acceptedBody: string;
    title: string;
  };
  matchInvite: {
    accepted: string;
    acceptedBody: string;
    title: string;
  };
  tournament: {
    sportAlert: string;
    registrationClosed: string;
    requestSent: string;
    registrationCanceled: string;
    registerResult: string;
  };
  favorites: {
    title: string;
    body: string;
  };
  web: {
    title: string;
    body: string;
  };
  phone: {
    title: string;
    body: string;
  };
  review: {
    title: string;
    ratingTitle: string;
    selectStars: string;
    deleteTitle: string;
    deleteBody: string;
  };
  profile: {
    coverPhoto: string;
    profilePhoto: string;
    unsaved: string;
    saved: string;
    comingSoon: string;
  };
  genderPicker: {
    title: string;
  };
  messages: {
    title: string;
  };
  preferences: {
    title: string;
    saved: string;
  };
  location: {
    title: string;
  };
  createMatch: {
    profileNotFound: string;
    calculatingPrice: string;
    login: string;
    noSlots: {
      title: string;
      body: string;
    };
  };
  matchEval: {
    saveScoreFail: string;
    voteFail: string;
    saveFail: string;
    retryLater: string;
  };
  onboarding: {
    order: string;
    selection: string;
    selectOne: string;
    selectMany: string;
    phase2: string;
  };
  seasonPass: {
    login: string;
    activated: string;
    loginRequiredLoad: string;
    loadFail: string;
    loading: string;
    displayFail: string;
    daysRemaining: string;
    currentLevel: string;
    totalSp: string;
    levelShort: string;
    spRemaining: string;
    spInLevel: string;
    elitePass: string;
    eliteActive: string;
    tabRewards: string;
    tabMissions: string;
    legendElite: string;
    legendFree: string;
    howEarnSp: string;
    noMissionsConfigured: string;
    spAvailable: string;
    completed: string;
    missionCompleted: string;
    missionCloses: string;
    noMissionsInTab: string;
    modalBenefitsDefault: string;
    getEliteCta: string;
    continueFree: string;
    confirmFail: string;
    rerollTitle: string;
    rerollMsg: string;
    rerollConfirm: string;
    rerollCancel: string;
    rerollFail: string;
  };
  clubReviews: {
    login: string;
    notYet: {
      title: string;
    };
  };
  favoriteClubs: {
    title: string;
  };
}

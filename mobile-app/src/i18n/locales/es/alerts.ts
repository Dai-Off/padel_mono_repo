import type { AlertsTranslationKeys } from '../../sections/alerts';

export const alerts: AlertsTranslationKeys = {
  session: {
    title: 'Sesión',
    loginRequired: 'Inicia sesión para…',
  },
  login: {
    title: 'Iniciar sesión',
    titleAlt: 'Inicia sesión',
  },
  permissionDenied: {
    title: 'Permiso denegado',
  },
  error: {
    title: 'Error',
  },
  ready: {
    title: 'Listo',
  },
  canceled: {
    title: 'Cancelado',
  },
  paymentRegistered: {
    title: 'Pago registrado',
  },
  slotPending: {
    title: 'Plaza pendiente',
  },
  slotTaken: {
    title: 'Plaza ocupada',
    body: 'Esa plaza ya no está disponible. Elige otra.',
  },
  matchFull: {
    title: 'Partido completo',
    body: 'Ya no quedan plazas libires. Elige otro partido.',
  },
  scheduleConflict: {
    title: 'Horario no disponible',
    body: 'Ya tienes un partido a esa hora. Elige otro partido.',
  },
  alreadyInMatch: {
    title: 'Ya estás dentro',
    body: 'Ya formas parte de este partido.',
  },
  matchCompletedWhilePaying: 'El partido se completó mientras pagabas.',
  slotAssigned: {
    title: 'Plaza asignada',
    body: 'Tu pago se completó en otra plaza porque la que elegiste ya estaba ocupada.',
  },
  paymentPending: {
    body: 'Tu pago se registró pero aún no apareces en el partido…',
  },
  declineMatch: {
    title: 'Declinar partido',
    body: 'Se cancelará la reserva y el partido para los cuatro jugadores…',
    yes: 'Sí, declinar',
    done: 'Has declinado el partido.',
  },
  leaveMatch: {
    titleCancel: '¿Cancelar el partido?',
    titleLeave: '¿Salir del partido?',
    bodySolo: 'Eres el único jugador: se anulará la reserva y el partido desaparecerá. Si pagaste, se reembolsará.',
    bodyMulti: 'Dejarás tu plaza; los demás siguen en el partido. Si pagaste tu parte, se reembolsará.',
    bodyOrganizerCancel:
      'Se cancelará el partido para todos los jugadores. Si alguien pagó, se reembolsará.',
    bodyOrganizerCancelNoRefund:
      'Se cancelará el partido para todos los jugadores. No habrá reembolso por la política del club.',
    bodySoloNoRefund: 'Eres el único jugador: se anulará la reserva y el partido desaparecerá. No habrá reembolso por la política del club.',
    bodyMultiNoRefund: 'Dejarás tu plaza. No habrá reembolso por la política del club.',
    policyNoRefundDefault: 'Fuera del plazo de reembolso del club: la baja se procesará sin devolución.',
    cancel: 'Cancelar',
    leave: 'Salir',
    yesCancel: 'Sí, cancelar todo',
    yesLeave: 'Sí, salir',
    doneCancel: 'El partido y la reserva quedaron cancelados.',
    doneLeave: 'Saliste del partido.',
    doneCancelWithRefund:
      'El partido y la reserva quedaron cancelados. Si pagaste con tarjeta, el reembolso se procesará en breve.',
    doneCancelNoRefund:
      'El partido y la reserva quedaron cancelados. No habrá reembolso por la política de cancelación del club.',
    doneLeaveWithRefund:
      'Saliste del partido. Si pagaste con tarjeta, el reembolso se procesará en breve.',
    doneLeaveNoRefund:
      'Saliste del partido. No habrá reembolso por la política de cancelación del club.',
    fail: 'No se pudo completar',
  },
  privateCancel: {
    title: 'Cancelar reserva',
    done: 'La reserva quedó cancelada. Si pagaste con tarjeta, el reembolso se procesará en breve.',
    doneNoRefund:
      'La reserva quedó cancelada. No habrá reembolso por la política de cancelación del club.',
    fail: 'No se pudo cancelar',
  },
  tournamentInvite: {
    accepted: 'Invitación aceptada',
    acceptedBody: 'Ya estás inscrito en el torneo.',
    title: 'Invitación al torneo',
  },
  matchInvite: {
    accepted: 'Invitación aceptada',
    acceptedBody: 'Ya puedes unirte al partido privado y pagar tu plaza.',
    title: 'Invitación al partido',
  },
  tournament: {
    sportAlert: 'Por ahora todos los torneos son de pádel.',
    registrationClosed: 'Las inscripciones no están abiertas.',
    requestSent: 'Solicitud enviada',
    registrationCanceled: 'Tu inscripción ha sido cancelada.',
    registerResult: 'Registrar resultado',
  },
  favorites: {
    title: 'Favoritos',
    body: 'Próximamente podrás guardar «{club}» en favoritos.',
  },
  web: {
    title: 'Web',
    body: 'Enlace del club disponible próximamente.',
  },
  phone: {
    title: 'Teléfono',
    body: 'Contacto del club disponible próximamente.',
  },
  review: {
    title: 'Reseña',
    ratingTitle: 'Valoración',
    selectStars: 'Selecciona de 1 a 5 estrellas.',
    deleteTitle: 'Eliminar reseña',
    deleteBody: '¿Quieres quitar tu valoración de este club?',
  },
  profile: {
    coverPhoto: 'Foto de portada',
    profilePhoto: 'Foto de perfil',
    unsaved: 'Cambios sin guardar',
    saved: 'Datos guardados correctamente.',
    comingSoon: 'Próximamente',
  },
  genderPicker: {
    title: 'Género',
  },
  messages: {
    title: 'Mensajes',
  },
  preferences: {
    title: 'Preferencias',
    saved: 'Cambios guardados.',
  },
  location: {
    title: 'Ubicación',
  },
  createMatch: {
    profileNotFound: 'No encontramos tu perfil. Espera un momento e inténtalo de nuevo.',
    calculatingPrice: 'Espera un momento a que terminemos de calcular el precio exacto.',
    login: 'Necesitas iniciar sesión para crear un partido.',
    noSlots: {
      title: 'Sin pistas disponibles',
      body: 'No hay pistas disponibles para la fecha y hora seleccionadas.',
    },
  },
  matchEval: {
    saveScoreFail: 'No se pudo guardar el marcador',
    voteFail: 'No se pudo registrar el voto',
    saveFail: 'No se pudo guardar',
    retryLater: 'Intenta de nuevo en unos segundos.',
  },
  onboarding: {
    order: 'Orden',
    selection: 'Selección',
    selectOne: 'Elige una opción para continuar.',
    selectMany: 'Elige al menos una opción.',
    phase2: 'Fase 2',
  },
  seasonPass: {
    login: 'Necesitas una cuenta para comprar el Pase Elite.',
    activated: 'Pase Elite activado ({plan}).',
    loginRequiredLoad: 'Inicia sesión para ver tu progreso en el pase.',
    loadFail: 'No se pudo cargar el pase. ¿Backend y migraciones 049 + 050 activas?',
    loading: 'Cargando pase…',
    displayFail: 'No se pudo mostrar el pase.',
    daysRemaining: '{count} días restantes',
    currentLevel: 'Tu nivel actual',
    totalSp: 'SP totales',
    forNextLevel: 'Para nivel {level}',
    totalSpInline: '{sp} SP totales',
    levelShort: 'Nivel {level}',
    spRemaining: 'Faltan {sp} SP',
    spInLevel: '{into} / {total} SP en este nivel',
    elitePass: 'Pase Elite',
    eliteActive: 'Pase Elite Activo',
    tabRewards: '🏆 Recompensas',
    tabMissions: '⚡ Misiones',
    legendElite: 'Pase Elite',
    legendFree: 'Pase Libre',
    passHelpTitle: '¿Cómo funciona el pase?',
    passHelpAboutTitle: 'El Pase de Temporada',
    passHelpAboutBody:
      'Sube de nivel y desbloquea recompensas antes de que termine. Cada {sp} SP es un nivel, hasta {max}. La temporada ({period}) termina en {days} días.',
    passHelpEarnTitle: 'Cómo ganar SP',
    passHelpEarnBody:
      'Completa las misiones diarias, semanales y mensuales del pase. Los boosts multiplican todo el SP que ganas: los da tu racha de lecciones (+15% a +70%) y también algunas recompensas del pase.',
    passHelpRewardsTitle: 'Recompensas',
    passHelpRewardsBody:
      'Cada nivel entrega recompensas: el carril gratuito es para todos y el carril Elite se desbloquea con el Pase Elite.',
    noMissionsConfigured: 'No hay misiones configuradas para esta temporada.',
    spObtained: 'SP obtenidos',
    completed: 'Completadas',
    missionCompleted: '¡Completada!',
    periodEndsIn: 'Terminan en {time}',
    noMissionsInTab: 'No hay misiones en esta pestaña.',
    modalBenefitsDefault: 'Beneficios según la configuración de tu temporada.',
    getEliteCta: 'Obtener Pase Elite',
    continueFree: 'Continuar con Pase Libre',
    confirmFail: 'No se pudo confirmar el Pase Elite. Inténtalo de nuevo.',
    rerollTitle: 'Cambiar misión',
    rerollMsg: '¿Sustituir "{title}" por otra misión al azar?',
    rerollQuotaDaily: 'Solo puedes hacer 1 cambio al día.',
    rerollQuotaWeekly: 'Solo puedes hacer 1 cambio a la semana.',
    rerollConfirm: 'Cambiar',
    rerollCancel: 'Cancelar',
    rerollFail: 'No se pudo cambiar la misión. Inténtalo más tarde.',
  },
  clubReviews: {
    login: 'Debes iniciar sesión para valorar un club.',
    notYet: {
      title: 'Aún no puedes valorar',
    },
  },
  favoriteClubs: {
    title: 'Clubes favoritos',
  },
};

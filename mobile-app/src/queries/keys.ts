/**
 * Factories de query keys por dominio.
 *
 * El userId forma parte de la key: un usuario nunca ve caché de otro, ni
 * siquiera el restaurado del persister tras un cambio de sesión. La raíz
 * (primer segmento) identifica el dominio y es lo que decide la whitelist
 * de persistencia en client.ts.
 */
export const seasonPassKeys = {
  all: (userId: string) => ['season-pass', userId] as const,
  /** Hero + track (rápido). Lo que bloquea el primer pintado del pase. */
  estado: (userId: string) => ['season-pass', userId, 'estado'] as const,
  /** Evaluación de misiones + celebraciones (lento). Llega por su cuenta. */
  misiones: (userId: string) => ['season-pass', userId, 'misiones'] as const,
};

export const profileKeys = {
  all: (userId: string) => ['profile', userId] as const,
  /** Perfil base (MyPlayerProfile): identidad, avatar, ELO, preferencias. */
  base: (userId: string) => ['profile', userId, 'base'] as const,
  /** Personalización + marcos + logros en 1 round-trip. Lo único que gatea el hero. */
  bundle: (userId: string) => ['profile', userId, 'bundle'] as const,
  /** Radar del Coach. Por locale: los textos llegan traducidos del backend. */
  radar: (userId: string, locale: string) => ['profile', userId, 'radar', locale] as const,
  /** Contadores en vivo del Coach (rellenan la card aparte del radar). */
  coachStats: (userId: string) => ['profile', userId, 'coach-stats'] as const,
  /** Insight del feedback de compañeros. Por locale. */
  peer: (userId: string, locale: string) => ['profile', userId, 'peer', locale] as const,
  /** Evolución del ELO. Por límite seleccionado (5/10/all). */
  level: (userId: string, limit: string) => ['profile', userId, 'level', limit] as const,
  /** Estadísticas agregadas (rachas, winrate, fiabilidad). */
  stats: (userId: string) => ['profile', userId, 'stats'] as const,
  /** Clubs y compañeros frecuentes. */
  social: (userId: string) => ['profile', userId, 'social'] as const,
};

/** Dashboard del Home. Volátil: la raíz 'home' NO se persiste. */
export const homeKeys = {
  all: (userId: string) => ['home', userId] as const,
  /** Contadores de quick actions (pistas libres, jugadores buscando…). */
  stats: (userId: string) => ['home', userId, 'stats'] as const,
  /** Count de torneos públicos. */
  tournamentsCount: (userId: string) => ['home', userId, 'tournaments-count'] as const,
  /** Reservas de pista privada del jugador (flujo aparte de partidos). */
  courtReservations: (userId: string) => ['home', userId, 'court-reservations'] as const,
  /** Racha de la lección diaria (current/longest/multiplier). */
  streak: (userId: string) => ['home', userId, 'streak'] as const,
};

/**
 * Matchmaking: estado de cola (+ invitaciones de pareja embebidas) e
 * invitaciones a partidos recibidas. Polling con refetchInterval. Volátil:
 * la raíz 'matchmaking' NO se persiste.
 */
export const matchmakingKeys = {
  all: (userId: string) => ['matchmaking', userId] as const,
  /** Estado de matchmaking + pair_invites (poll 5s). */
  status: (userId: string) => ['matchmaking', userId, 'status'] as const,
  /** Invitaciones a partidos recibidas (poll 8s). */
  receivedInvites: (userId: string) => ['matchmaking', userId, 'received-invites'] as const,
};

/**
 * Perfil público de OTRO jugador. Keyed por el playerId objetivo (no por el
 * viewer): en una sesión solo hay un viewer y el caché es volátil (no se
 * persiste, y el logout hace queryClient.clear()).
 */
export const publicProfileKeys = {
  all: (playerId: string) => ['public-profile', playerId] as const,
  /** Perfil base público (incluye isFollowing/followersCount para el viewer). */
  base: (playerId: string) => ['public-profile', playerId, 'base'] as const,
  /** Personalización pública (marco, título, tema). */
  customization: (playerId: string) => ['public-profile', playerId, 'customization'] as const,
  /** Estadísticas agregadas del jugador. */
  stats: (playerId: string) => ['public-profile', playerId, 'stats'] as const,
  /** Evolución del ELO. Por límite seleccionado (5/10/all). */
  level: (playerId: string, limit: string) => ['public-profile', playerId, 'level', limit] as const,
  /** Clubs y compañeros frecuentes (públicos). */
  social: (playerId: string) => ['public-profile', playerId, 'social'] as const,
};

/**
 * "Tu actividad" (historial): partidos pasados, inscripciones a cursos,
 * torneos (paginado) y conteo de clubs favoritos. Volátil: NO se persiste.
 */
export const tuActividadKeys = {
  all: (userId: string) => ['tu-actividad', userId] as const,
  /** Partidos pasados mapeados con el viewer (perspectiva del jugador). */
  pastPartidos: (userId: string, viewerId: string) =>
    ['tu-actividad', userId, 'past-partidos', viewerId] as const,
  /** Inscripciones a cursos de escuela. */
  enrollments: (userId: string) => ['tu-actividad', userId, 'enrollments'] as const,
  /** Torneos del jugador (infinite query paginada por offset). */
  tournaments: (userId: string) => ['tu-actividad', userId, 'tournaments'] as const,
  /** Conteo de clubs favoritos (resuelto contra el catálogo). */
  favoriteClubs: (userId: string) => ['tu-actividad', userId, 'favorite-clubs'] as const,
};

/**
 * Catálogo público de la tienda. Sin userId: los datos no dependen de la
 * sesión (endpoints públicos). Volátil: la raíz 'store' NO se persiste.
 */
export const storeKeys = {
  all: () => ['store'] as const,
  /** Catálogo completo (+ flash embebido en la respuesta). */
  products: () => ['store', 'products'] as const,
  /** Campaña flash y sus productos. */
  flash: () => ['store', 'flash'] as const,
  /** Colecciones destacadas. */
  collections: () => ['store', 'collections'] as const,
};

/** Partidos (mine + discovery). Volátil y con upserts optimistas: NO persistir. */
export const matchesKeys = {
  all: (userId: string) => ['matches', userId] as const,
  /** Carrusel "Mis partidos": server + upserts locales merged. */
  mine: (userId: string) => ['matches', userId, 'mine'] as const,
  /** Prefijo para invalidar discovery con cualquier viewer. */
  discoveryAll: (userId: string) => ['matches', userId, 'discovery'] as const,
  /** Listado público de discovery, mapeado con el viewer actual. */
  discovery: (userId: string, viewerId: string) =>
    ['matches', userId, 'discovery', viewerId] as const,
};

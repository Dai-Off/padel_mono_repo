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
  /** Racha de la lección diaria (current/longest/multiplier). */
  streak: (userId: string) => ['home', userId, 'streak'] as const,
};

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

/**
 * Tipo compartido de "logro" (trofeo / insignia / curso) para la Vitrina de
 * Logros y la personalización. El catálogo real y los desbloqueos llegan del
 * backend en Fase 2; aquí solo vive el contrato de datos para la UI.
 */
import type { AchievementRarity } from './rarity';

export type AchievementType = 'trophy' | 'badge' | 'course';

export interface Achievement {
  id: string;
  type: AchievementType;
  title: string;
  description: string;
  /** Nombre de glyph de Ionicons (p.ej. 'trophy-outline'). */
  icon: string;
  rarity: AchievementRarity;
  sport?: string | null;
  /** Fecha ya formateada para mostrar (p.ej. "Ago 2025"). */
  date?: string | null;
  /** Visible para otros jugadores en el perfil. */
  isPublic?: boolean;
  /** 0-100 cuando está en progreso (<100); ausente = conseguido. */
  progress?: number;
}

/** Etiqueta legible por tipo de logro. */
export const ACHIEVEMENT_TYPE_LABEL: Record<AchievementType, string> = {
  trophy: 'Trofeos',
  badge: 'Insignias',
  course: 'Cursos',
};

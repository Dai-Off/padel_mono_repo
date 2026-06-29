/**
 * Vocabulario en código para los marcos de avatar (la BD solo guarda las claves).
 *  - `FRAME_STYLES`: geometría por estilo (lo lee AvatarWithFrame).
 *  - `frameGradient`: color/paleta del marco (override `colors` o color de la rareza).
 *  - `describeUnlock`: texto de la condición de desbloqueo (para ítems bloqueados).
 */
import { RARITY_CONFIG, type AchievementRarity } from './rarity';

export type FrameStyleKey = 'none' | 'solid' | 'thin' | 'double' | 'glow' | 'bevel';

export interface FrameStyleDef {
  /** Grosor del borde principal. 0 = sin marco. */
  borderWidth: number;
  /** Doble anillo (borde + anillo exterior con gap). */
  double?: boolean;
  /** Resplandor (sombra de color alrededor). */
  glow?: boolean;
  /** Relieve/bisel (degradado diagonal marcado). */
  bevel?: boolean;
}

export const FRAME_STYLES: Record<FrameStyleKey, FrameStyleDef> = {
  none: { borderWidth: 0 },
  solid: { borderWidth: 3 },
  thin: { borderWidth: 1.5 },
  double: { borderWidth: 2.5, double: true },
  glow: { borderWidth: 3, glow: true },
  bevel: { borderWidth: 3, bevel: true },
};

export function getFrameStyle(style: string | null | undefined): FrameStyleDef {
  return FRAME_STYLES[(style as FrameStyleKey) ?? 'solid'] ?? FRAME_STYLES.solid;
}

/**
 * Colores del marco para el degradado: usa `colors` (override del catálogo) si
 * existe; si no, deriva del color de la rareza. Devuelve ≥2 paradas.
 */
export function frameGradient(colors: string[] | null | undefined, rarity: AchievementRarity): string[] {
  if (colors && colors.length >= 2) return colors;
  if (colors && colors.length === 1) return [colors[0], colors[0]];
  const c = RARITY_CONFIG[rarity].color;
  return [c, c];
}

/** Texto legible de la condición de desbloqueo (para el selector). */
export function describeUnlock(unlockType: string, value: string | null): string {
  const n = value ?? '';
  switch (unlockType) {
    case 'default':
      return 'Disponible';
    case 'manual':
      return 'Recompensa especial';
    case 'matches':
      return `Juega ${n} partidos`;
    case 'wins':
      return `Gana ${n} partidos`;
    case 'win_streak':
      return `Racha de ${n} victorias`;
    case 'level':
      return `Alcanza el nivel ${n}`;
    case 'daily_lesson_streak':
      return `Lección diaria ${n} días seguidos`;
    case 'courses_completed':
      return Number(n) === 1 ? 'Completa tu primer curso' : `Completa ${n} cursos`;
    case 'course':
      return 'Completa un curso concreto';
    default:
      return '';
  }
}

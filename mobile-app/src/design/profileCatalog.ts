/**
 * Catálogo de personalización del perfil: TÍTULOS y MARCOS de avatar.
 *
 * Es la fuente de verdad en el cliente; los mismos IDs se sembrarán en el
 * backend (Fase 3) para validar desbloqueos. Portado del diseño de Figma.
 */
import type { AchievementRarity } from './rarity';

// ─── Condición de desbloqueo ───
export type UnlockType =
  | 'default' // disponible por defecto
  | 'none' // sin requisito (p.ej. "Sin marco")
  | 'matches'
  | 'wins'
  | 'streak'
  | 'level'
  | 'tournament'
  | 'social'
  | 'achievement';

export interface UnlockRequirement {
  type: UnlockType;
  value?: string | number;
}

// ─── Títulos ───
export interface TitleReward {
  id: string;
  title: string;
  rarity: AchievementRarity;
  unlockCondition: string;
  unlockRequirement: UnlockRequirement;
  /** Icono semántico (se resuelve a glyph en la UI de personalización, Fase 3). */
  icon: string;
}

export const TITLE_REWARDS: TitleReward[] = [
  // Común / por defecto
  { id: 'novato', title: 'Novato', rarity: 'common', unlockCondition: 'Disponible por defecto', unlockRequirement: { type: 'default' }, icon: 'star' },
  { id: 'jugador', title: 'Jugador', rarity: 'common', unlockCondition: 'Juega 5 partidos', unlockRequirement: { type: 'matches', value: 5 }, icon: 'shield' },
  { id: 'guerrero', title: 'Guerrero de Pista', rarity: 'common', unlockCondition: 'Gana 10 partidos', unlockRequirement: { type: 'wins', value: 10 }, icon: 'sword' },
  { id: 'estudioso', title: 'Estudioso', rarity: 'common', unlockCondition: 'Completa la lección diaria 3 días seguidos', unlockRequirement: { type: 'default' }, icon: 'school' },
  // Raro
  { id: 'francotirador', title: 'Francotirador', rarity: 'rare', unlockCondition: 'Completar curso: Saque y resto eficaz', unlockRequirement: { type: 'achievement', value: 'c2' }, icon: 'target' },
  { id: 'matador', title: 'El Matador de la Red', rarity: 'rare', unlockCondition: 'Gana 25 partidos', unlockRequirement: { type: 'wins', value: 25 }, icon: 'target' },
  { id: 'smash', title: 'Rey del Smash', rarity: 'rare', unlockCondition: 'Racha de 5 victorias', unlockRequirement: { type: 'streak', value: 5 }, icon: 'crown' },
  { id: 'muro', title: 'El Muro', rarity: 'rare', unlockCondition: 'Juega 50 partidos', unlockRequirement: { type: 'matches', value: 50 }, icon: 'shield' },
  { id: 'social', title: 'Alma del Club', rarity: 'rare', unlockCondition: 'Juega con 20 compañeros distintos', unlockRequirement: { type: 'social', value: 20 }, icon: 'star' },
  // Épico
  { id: 'rey_red', title: 'Rey de la Red', rarity: 'epic', unlockCondition: 'Gana 10 puntos de volea en partidos', unlockRequirement: { type: 'default' }, icon: 'target' },
  { id: 'cristal', title: 'Maestro del Cristal', rarity: 'epic', unlockCondition: 'Alcanza nivel 3.0', unlockRequirement: { type: 'level', value: 3.0 }, icon: 'medal' },
  { id: 'pared', title: 'La Pared Humana', rarity: 'epic', unlockCondition: 'Racha de 10 victorias', unlockRequirement: { type: 'streak', value: 10 }, icon: 'shield' },
  { id: 'bandeja', title: 'Bandeja Letal', rarity: 'epic', unlockCondition: 'Gana 50 partidos', unlockRequirement: { type: 'wins', value: 50 }, icon: 'target' },
  { id: 'campeon', title: 'Campeón Local', rarity: 'epic', unlockCondition: 'Gana un torneo', unlockRequirement: { type: 'tournament', value: 1 }, icon: 'trophy' },
  // Legendario
  { id: 'leyenda', title: 'Leyenda del Club', rarity: 'legendary', unlockCondition: 'Juega 200 partidos', unlockRequirement: { type: 'matches', value: 200 }, icon: 'crown' },
  { id: 'maquina', title: 'La Máquina', rarity: 'legendary', unlockCondition: 'Racha de 15 victorias', unlockRequirement: { type: 'streak', value: 15 }, icon: 'flame' },
  { id: 'estratega', title: 'Estratega Supremo', rarity: 'legendary', unlockCondition: 'Alcanza nivel 4.0+', unlockRequirement: { type: 'level', value: 4.0 }, icon: 'crown' },
  { id: 'dominador', title: 'Dominador Absoluto', rarity: 'legendary', unlockCondition: 'Gana 3 torneos', unlockRequirement: { type: 'tournament', value: 3 }, icon: 'trophy' },
];

// ─── Marcos de avatar ───
export type FrameAnimationType =
  | 'rotate'
  | 'pulse'
  | 'flicker'
  | 'breathe'
  | 'shake'
  | 'orbit'
  | 'warp'
  | 'glitch'
  | 'ripple'
  | 'morph';

export interface ProfileFrame {
  id: string;
  name: string;
  rarity: AchievementRarity;
  /** Colores del gradiente del marco (1+; conic/linear según render). */
  colors: string[];
  animated?: boolean;
  animationType?: FrameAnimationType;
  unlockCondition: string;
  unlockRequirement: UnlockRequirement;
}

export const PROFILE_FRAMES: ProfileFrame[] = [
  // Común
  { id: 'none', name: 'Sin marco', rarity: 'common', colors: ['transparent'], unlockCondition: 'Por defecto', unlockRequirement: { type: 'none' } },
  { id: 'orange-solid', name: 'Naranja Clásico', rarity: 'common', colors: ['#F18F34', '#E95F32'], unlockCondition: 'Por defecto', unlockRequirement: { type: 'none' } },
  { id: 'plata', name: 'Plata', rarity: 'common', colors: ['#9CA3AF', '#D1D5DB'], unlockCondition: 'Reserva tu primera pista', unlockRequirement: { type: 'default' } },
  { id: 'silver', name: 'Plata Antiguo', rarity: 'common', colors: ['#9CA3AF', '#D1D5DB'], unlockCondition: 'Juega 10 partidos', unlockRequirement: { type: 'matches', value: 10 } },
  // Raro
  { id: 'golden', name: 'Dorado', rarity: 'rare', colors: ['#F59E0B', '#FBBF24', '#D97706'], unlockCondition: 'Gana 25 partidos', unlockRequirement: { type: 'wins', value: 25 } },
  { id: 'emerald', name: 'Esmeralda', rarity: 'rare', colors: ['#10B981', '#34D399', '#059669'], unlockCondition: 'Racha de 5 victorias', unlockRequirement: { type: 'streak', value: 5 } },
  { id: 'ocean', name: 'Océano', rarity: 'rare', colors: ['#3B82F6', '#60A5FA', '#2563EB'], unlockCondition: 'Juega 50 partidos', unlockRequirement: { type: 'matches', value: 50 } },
  { id: 'aurora', name: 'Aurora Boreal', rarity: 'rare', colors: ['#06B6D4', '#8B5CF6', '#EC4899'], animated: true, animationType: 'orbit', unlockCondition: 'Juega con 15 compañeros', unlockRequirement: { type: 'matches', value: 40 } },
  // Épico
  { id: 'platino', name: 'Escudo de Platino', rarity: 'epic', colors: ['#E2E8F0', '#9CA3AF', '#F1F5F9', '#D1D5DB'], animated: true, animationType: 'breathe', unlockCondition: 'Completa curso: Defensa y contrataque', unlockRequirement: { type: 'achievement', value: 'c5' } },
  { id: 'amethyst', name: 'Amatista', rarity: 'epic', colors: ['#8B5CF6', '#A78BFA', '#7C3AED'], animated: true, animationType: 'rotate', unlockCondition: 'Alcanza nivel 3.0', unlockRequirement: { type: 'matches', value: 75 } },
  { id: 'fire', name: 'Fuego', rarity: 'epic', colors: ['#EF4444', '#F97316', '#FBBF24'], animated: true, animationType: 'pulse', unlockCondition: 'Racha de 10 victorias', unlockRequirement: { type: 'streak', value: 10 } },
  { id: 'neon', name: 'Neón', rarity: 'epic', colors: ['#06B6D4', '#22D3EE', '#67E8F9'], animated: true, animationType: 'flicker', unlockCondition: 'Gana un torneo', unlockRequirement: { type: 'achievement', value: '9' } },
  { id: 'toxic', name: 'Tóxico', rarity: 'epic', colors: ['#22C55E', '#86EFAC', '#16A34A', '#4ADE80'], animated: true, animationType: 'breathe', unlockCondition: 'Juega 100 partidos', unlockRequirement: { type: 'matches', value: 100 } },
  { id: 'plasma', name: 'Plasma', rarity: 'epic', colors: ['#E879F9', '#F0ABFC', '#C026D3', '#D946EF'], animated: true, animationType: 'shake', unlockCondition: 'Gana 40 partidos', unlockRequirement: { type: 'wins', value: 40 } },
  // Legendario
  { id: 'champion', name: 'Campeón', rarity: 'legendary', colors: ['#F18F34', '#FBBF24', '#F59E0B', '#E95F32'], animated: true, animationType: 'warp', unlockCondition: 'Gana 3 torneos', unlockRequirement: { type: 'wins', value: 100 } },
  { id: 'diamond', name: 'Diamante', rarity: 'legendary', colors: ['#67E8F9', '#A5F3FC', '#CFFAFE', '#06B6D4'], animated: true, animationType: 'glitch', unlockCondition: 'Alcanza nivel 4.0+', unlockRequirement: { type: 'matches', value: 200 } },
  { id: 'inferno', name: 'Infierno', rarity: 'legendary', colors: ['#DC2626', '#F97316', '#FBBF24', '#EF4444'], animated: true, animationType: 'ripple', unlockCondition: 'Racha de 15 victorias', unlockRequirement: { type: 'streak', value: 15 } },
  { id: 'supernova', name: 'Supernova', rarity: 'legendary', colors: ['#FBBF24', '#FFFFFF', '#F59E0B', '#FDE68A'], animated: true, animationType: 'morph', unlockCondition: 'Gana 5 torneos', unlockRequirement: { type: 'wins', value: 150 } },
  { id: 'void', name: 'Vacío', rarity: 'legendary', colors: ['#6366F1', '#1E1B4B', '#818CF8', '#4338CA'], animated: true, animationType: 'rotate', unlockCondition: 'Juega 300 partidos', unlockRequirement: { type: 'matches', value: 300 } },
  { id: 'dragon', name: 'Dragón', rarity: 'legendary', colors: ['#DC2626', '#991B1B', '#FBBF24', '#B91C1C'], animated: true, animationType: 'pulse', unlockCondition: 'Racha de 20 victorias', unlockRequirement: { type: 'streak', value: 20 } },
];

export const getTitleById = (id: string | null | undefined): TitleReward | null =>
  id ? TITLE_REWARDS.find((t) => t.id === id) ?? null : null;

export const getFrameById = (id: string | null | undefined): ProfileFrame | null =>
  id ? PROFILE_FRAMES.find((f) => f.id === id) ?? null : null;

/**
 * Sistema de rarezas compartido para logros, títulos y marcos del perfil.
 * Fuente de verdad de colores/etiquetas por rareza (consumido por UI y catálogos).
 */
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface RarityStyle {
  label: string;
  /** Color principal (texto/acento). */
  color: string;
  /** Fondo translúcido para tarjetas/chips. */
  bg: string;
  /** Borde translúcido. */
  border: string;
  /** Color para shadow/glow (sombra). */
  glow: string;
  /** Marca decorativa junto al nombre (●/◆/✦). */
  symbol: string;
}

export const RARITY_CONFIG: Record<AchievementRarity, RarityStyle> = {
  common: {
    label: 'Común',
    color: '#9CA3AF',
    bg: 'rgba(156,163,175,0.10)',
    border: 'rgba(156,163,175,0.30)',
    glow: 'rgba(156,163,175,0.00)',
    symbol: '',
  },
  rare: {
    label: 'Raro',
    color: '#3B82F6',
    bg: 'rgba(59,130,246,0.10)',
    border: 'rgba(59,130,246,0.30)',
    glow: 'rgba(59,130,246,0.35)',
    symbol: '●',
  },
  epic: {
    label: 'Épico',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.10)',
    border: 'rgba(139,92,246,0.30)',
    glow: 'rgba(139,92,246,0.40)',
    symbol: '◆',
  },
  legendary: {
    label: 'Legendario',
    color: '#F18F34',
    bg: 'rgba(241,143,52,0.10)',
    border: 'rgba(241,143,52,0.30)',
    glow: 'rgba(241,143,52,0.50)',
    symbol: '✦',
  },
};

/** Orden de presentación (de mayor a menor rareza). */
export const RARITY_ORDER: AchievementRarity[] = ['legendary', 'epic', 'rare', 'common'];

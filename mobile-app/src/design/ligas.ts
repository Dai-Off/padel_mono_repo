/**
 * Vocabulario en código para las ligas de matchmaking (color + etiqueta + icono).
 * El código de liga (`bronce|plata|oro|elite`) viene del backend; aquí mapeamos
 * su presentación. El label fino (p.ej. "Plata III") puede venir de league-config;
 * este es el fallback por tier.
 */
import { Ionicons } from '@expo/vector-icons';

export interface LigaStyle {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const LIGAS: Record<string, LigaStyle> = {
  bronce: { label: 'Bronce', color: '#CD7F32', icon: 'shield-half' },
  plata: { label: 'Plata', color: '#AAB4BE', icon: 'shield-half' },
  oro: { label: 'Oro', color: '#F5B301', icon: 'shield' },
  elite: { label: 'Élite', color: '#A855F7', icon: 'diamond' },
};

/** Estilo de la liga por su código; null si no hay liga. */
export function getLigaStyle(code?: string | null): LigaStyle | null {
  if (!code) return null;
  const key = code.trim().toLowerCase();
  if (!key) return null;
  return LIGAS[key] ?? { label: code, color: '#F18F34', icon: 'shield' };
}

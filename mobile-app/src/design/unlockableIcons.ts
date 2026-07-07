import { Ionicons } from '@expo/vector-icons';

export type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * El catálogo de unlockables (backend) usa presets de icono con nombre libre
 * ('crown', 'sword', 'target'…) que no siempre existen en Ionicons — pasarlos
 * directos pinta "?" y llena Metro de warnings. Este resolver mapea los
 * presets sin glyph a su equivalente más cercano y valida el resto contra
 * glyphMap con fallback.
 */
const PRESET_ALIASES: Record<string, IoniconName> = {
  crown: 'ribbon',
  sword: 'flash',
  target: 'locate',
};

export function resolveUnlockableIcon(
  name: string | null | undefined,
  fallback: IoniconName = 'trophy'
): IoniconName {
  if (!name) return fallback;
  const alias = PRESET_ALIASES[name];
  if (alias) return alias;
  return name in Ionicons.glyphMap ? (name as IoniconName) : fallback;
}

import { StyleSheet, type ViewStyle } from 'react-native';

/**
 * Estilo único de "lockedBadge" usado por TODAS las cards bloqueables del Home
 * (Lección Diaria, IA Afinidad, Liga Competitiva). Centralizar evita que las
 * cards drift visualmente — todas tienen exactamente el mismo padding, radius,
 * tamaño y tamaño de texto.
 *
 * Cada card pasa su color (varía con el tema en Lección Diaria) y el badge se
 * tinta con ese color: background `rgba(color, 0.12)`, borde `rgba(color, 0.3)`.
 * Esto consigue que el badge se vea "vivo" del color de la card en vez de un
 * blanco translúcido apagado.
 */
export const lockBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    // Altura fija para que en cards con headerRow alto (Liga) el badge no se
    // estire verticalmente y todas las apariciones midan exactamente igual.
    height: 22,
  },
  text: {
    fontSize: 10,
    fontWeight: '900',
  },
});

/** Tamaño canónico del icono dentro del badge (en todas las cards). */
export const LOCK_BADGE_ICON_SIZE = 12;

/**
 * Construye el tinte de background+border para el badge a partir de un triplete
 * RGB ("R, G, B"). Garantiza que el badge se vea coherente con el color de la
 * card sin tener que repetir alphas en cada archivo.
 */
export function lockBadgeTint(rgbTriplet: string): ViewStyle {
  return {
    backgroundColor: `rgba(${rgbTriplet}, 0.12)`,
    borderColor: `rgba(${rgbTriplet}, 0.3)`,
  };
}

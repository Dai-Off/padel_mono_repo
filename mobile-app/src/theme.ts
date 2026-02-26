import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Escala tipografía respetando la preferencia de accesibilidad del usuario */
export const scaleFont = (size: number) => {
  const scale = PixelRatio.getFontScale();
  return Math.round(size * Math.min(scale, 1.5));
};

/** Spacing base: pantallas pequeñas (< 375px) usan valores ligeramente menores */
export const getSpacing = (base: number): number => {
  if (SCREEN_WIDTH < 360) return Math.max(base - 4, 12);
  return base;
};

/** Valores de tema para consistencia iOS + Android */
export const theme = {
  spacing: {
    xs: getSpacing(8),
    sm: getSpacing(12),
    md: getSpacing(16),
    lg: getSpacing(20),
    xl: getSpacing(24),
    xxl: getSpacing(32),
  },
  fontSize: {
    xs: scaleFont(12),
    sm: scaleFont(14),
    base: scaleFont(16),
    lg: scaleFont(18),
    xl: scaleFont(20),
    xxl: scaleFont(28),
  },
  headerHeight: 56,
  minTouchTarget: 44, // Mínimo recomendado para áreas táctiles (Apple HIG, Android)
  screenWidth: SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,
} as const;

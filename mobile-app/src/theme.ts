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
  /** Padding uniforme para headers superiores (pt, pb) */
  headerPadding: { paddingTop: getSpacing(16), paddingBottom: getSpacing(12) },
  /** Espacio extra bajo el scroll para no tapar la bottom bar */
  scrollBottomPadding: 72,
  minTouchTarget: 44, // Mínimo recomendado para áreas táctiles (Apple HIG, Android)
  screenWidth: SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,

  /** Colores para pantallas de auth (landing, login, register) - tema oscuro */
  auth: {
    bg: '#0F0F0F',
    inputBg: '#1A1A1A',
    inputBorder: 'rgba(255,255,255,0.1)',
    accent: '#F18F34',
    accentShadow: 'rgba(241, 143, 52, 0.4)',
    text: '#ffffff',
    textMuted: '#9ca3af',
    textSecondary: '#6b7280',
    label: '#9ca3af',
    error: '#E31E24',
    errorBg: 'rgba(227, 30, 36, 0.1)',
    info: '#2563eb',
    infoBg: 'rgba(37, 99, 235, 0.1)',
  },

  /** Colores sidebar (tema oscuro, consistente con auth) */
  sidebar: {
    bg: '#0F0F0F',
    overlayBg: 'rgba(0,0,0,0.6)',
    avatarGradientFrom: '#F18F34',
    avatarGradientTo: '#E95F32',
    buttonBg: 'rgba(255,255,255,0.06)',
    buttonBorder: 'rgba(255,255,255,0.08)',
    /** Variantes de icono para items del menú */
    iconVariants: {
      orange: { from: 'rgba(241,143,52,0.2)', to: 'rgba(233,95,50,0.1)', color: '#F18F34' },
      purple: { from: 'rgba(168,85,247,0.2)', to: 'rgba(147,51,234,0.1)', color: '#c084fc' },
      emerald: { from: 'rgba(16,185,129,0.2)', to: 'rgba(5,150,105,0.1)', color: '#34d399' },
      sky: { from: 'rgba(14,165,233,0.2)', to: 'rgba(37,99,235,0.1)', color: '#38bdf8' },
      neutral: { from: 'rgba(255,255,255,0.08)', to: 'rgba(255,255,255,0.04)', color: '#9ca3af' },
      red: { from: 'rgba(239,68,68,0.2)', to: 'rgba(239,68,68,0.1)', color: '#f87171' },
    },
  },
} as const;

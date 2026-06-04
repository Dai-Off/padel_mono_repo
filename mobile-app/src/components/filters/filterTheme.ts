import { theme } from '../../theme';

/** Tokens compartidos para filtros (barra + bottom sheets), alineados al tema oscuro de la app. */
export const filterTheme = {
  bg: theme.auth.bg,
  sheetBg: '#1A1A1A',
  sheetBorder: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(0,0,0,0.6)',
  accent: theme.auth.accent,
  accentMuted: 'rgba(241, 143, 52, 0.14)',
  accentBorder: 'rgba(241, 143, 52, 0.35)',
  text: '#ffffff',
  textMuted: theme.auth.textMuted,
  textSecondary: theme.auth.textSecondary,
  chipBg: 'rgba(255,255,255,0.05)',
  chipBorder: 'rgba(255,255,255,0.1)',
  chipActiveBg: 'rgba(241, 143, 52, 0.16)',
  chipActiveBorder: 'rgba(241, 143, 52, 0.45)',
  pillSelectedBg: theme.auth.accent,
  pillUnselectedBg: 'rgba(255,255,255,0.06)',
  pillUnselectedBorder: 'rgba(255,255,255,0.12)',
  sectionBorder: 'rgba(255,255,255,0.06)',
  handle: 'rgba(255,255,255,0.22)',
  danger: theme.auth.error,
} as const;

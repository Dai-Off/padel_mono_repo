import { Platform, TextStyle } from 'react-native';

/**
 * En Android los textos suelen recortarse con los mismos estilos que en iOS.
 * Aumenta ligeramente lineHeight y padding vertical sin cambiar el diseño en iOS.
 */
export function androidReadableText(base: TextStyle): TextStyle {
  if (Platform.OS !== 'ios') {
    const fs = typeof base.fontSize === 'number' ? base.fontSize : 14;
    return {
      ...base,
      lineHeight:
        base.lineHeight != null && typeof base.lineHeight === 'number'
          ? base.lineHeight + 2
          : Math.round(fs * 1.38),
      paddingVertical:
        typeof base.paddingVertical === 'number'
          ? base.paddingVertical + 1
          : 2,
    };
  }
  return base;
}

/**
 * Títulos de sección (p. ej. «En Directo»): en Android `includeFontPadding` y el
 * padding extra suelen recortar el texto; damos más aire sin `paddingVertical` agresivo.
 */
export function androidSectionHeading(base: TextStyle): TextStyle {
  if (Platform.OS === 'ios') return base;
  const fs = typeof base.fontSize === 'number' ? base.fontSize : 20;
  return {
    ...base,
    includeFontPadding: false,
    lineHeight:
      base.lineHeight != null && typeof base.lineHeight === 'number'
        ? base.lineHeight + 4
        : Math.round(fs * 1.35),
    paddingTop: 2,
    paddingBottom: 6,
    flexShrink: 0,
  };
}

export function androidSectionSubline(base: TextStyle): TextStyle {
  if (Platform.OS === 'ios') return base;
  const fs = typeof base.fontSize === 'number' ? base.fontSize : 14;
  return {
    ...base,
    includeFontPadding: false,
    lineHeight:
      base.lineHeight != null && typeof base.lineHeight === 'number'
        ? base.lineHeight + 2
        : Math.round(fs * 1.45),
    paddingBottom: 2,
  };
}

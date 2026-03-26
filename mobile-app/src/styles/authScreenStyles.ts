import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { AUTH_COLUMN_MAX } from '../constants/authLayout';
import { lineHeightFor, theme } from '../theme';

export { AUTH_COLUMN_MAX };

/** Fila opciones: el flex vive en View hijos, no en Pressable (evita recorte en iOS/Android). */
export const loginExtrasRow: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  width: '100%',
  marginBottom: theme.spacing.sm,
};

/** Izquierda: ancho al contenido; si flex:1 compite con la derecha, Android recorta “Recordarme”. */
export const loginExtrasColLeft: ViewStyle = {
  flexShrink: 0,
  flexGrow: 0,
  marginRight: theme.spacing.sm,
  /** Android: ancho mínimo para no recortar “Recordarme” (checkbox + margen + texto). */
  minWidth: 148,
};

export const loginExtrasColRight: ViewStyle = {
  flex: 1,
  minWidth: 0,
  alignItems: 'flex-end',
};

export const loginCheckboxInner: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
};

export const loginCheckboxLabelWrap: ViewStyle = {
  flex: 1,
  minWidth: 0,
};

export const loginForgotLabel: TextStyle = {
  fontSize: theme.fontSize.sm,
  lineHeight: lineHeightFor(theme.fontSize.sm),
  fontWeight: '500',
  color: theme.auth.accent,
  textAlign: 'right',
  width: '100%',
  ...Platform.select({
    android: { includeFontPadding: false, paddingVertical: 1 },
    default: {},
  }),
};

/** Botón: texto sin flexShrink en contenedor (antes recortaba “Iniciar Sesión”). */
export const authButtonInner: ViewStyle = {
  width: '100%',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
  alignContent: 'center',
};

export const authFormLinkWrap: ViewStyle = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'center',
  paddingVertical: theme.spacing.sm,
  width: '100%',
};

export const authFooterWrap: ViewStyle = Platform.select({
  android: {
    paddingVertical: theme.spacing.lg,
    width: '100%',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: theme.spacing.sm,
  },
  default: {
    paddingVertical: theme.spacing.lg,
    width: '100%',
    paddingHorizontal: theme.spacing.xs,
  },
}) as ViewStyle;

export const authFooterTextStyle: TextStyle = {
  fontSize: theme.fontSize.xs,
  color: theme.auth.textSecondary,
  textAlign: 'center',
  /** ≥ 1.2× fontSize (1.45 mantiene legibilidad en párrafos). */
  lineHeight: Math.max(lineHeightFor(theme.fontSize.xs), Math.round(theme.fontSize.xs * 1.45)),
  width: '100%',
  alignSelf: 'stretch',
  ...Platform.select({
    android: { includeFontPadding: false, paddingVertical: 1 },
    default: {},
  }),
};

export const registerConfirmContent: ViewStyle = Platform.select({
  android: {
    flexGrow: 1,
    width: '100%',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 280,
  },
  default: {
    flexGrow: 1,
    width: '100%',
    paddingVertical: theme.spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 280,
  },
}) as ViewStyle;

export const authInputLabelAndroid: TextStyle = Platform.select({
  android: {
    width: '100%',
  },
  default: {},
}) as TextStyle;
